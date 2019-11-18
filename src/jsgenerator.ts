import * as ir from './ir';
import { hasTypeGotHandle, mangleFunctionName, mangleMethod, FunctionKind, isVoid, isLiteralOrUndefinedType, getBindingType, getSafeIdentifier} from './utils'

export default function generateJsCode(declarations: ir.Declaration[], packageName: string) : string {
    const prefix = `// File is autogenerated with \`typescript-d-bindgen\`
import {spasm as spa, encoders as encoder, decoders as decoder} from '../modules/spasm.js';
const spasm = spa;
let memory = {};
const objects = spasm.objects;
const addObject = spasm.addObject;
const setupMemory = () => {
    let buffer = spasm.memory.buffer;
    if (memory.buffer == buffer)
        return;
    memory.buffer = buffer;
    memory.heapi32s = new Int32Array(buffer)
    memory.heapi32u = new Uint32Array(buffer)
    memory.heapi16s = new Int16Array(buffer)
    memory.heapi16u = new Uint16Array(buffer)
    memory.heapi8s = new Int8Array(buffer)
    memory.heapi8u = new Uint8Array(buffer)
    memory.heapf32 = new Float32Array(buffer)
    memory.heapf64 = new Float64Array(buffer)
}
const setBool = (ptr, val) => (memory.heapi32u[ptr/4] = +val),
      setInt = (ptr, val) => (memory.heapi32s[ptr/4] = val),
      setUInt = (ptr, val) => (memory.heapi32u[ptr/4] = val),
      setShort = (ptr, val) => (memory.heapi16s[ptr/2] = val),
      setUShort = (ptr, val) => (memory.heapi16u[ptr/2] = val),
      setByte = (ptr, val) => (memory.heapi8s[ptr] = val),
      setUByte = (ptr, val) => (memory.heapi8u[ptr] = val),
      setFloat = (ptr, val) => (memory.heapf32[ptr/4] = val),
      setDouble = (ptr, val) => (memory.heapf64[ptr/8] = val),
      getBool = (ptr) => memory.heapi32u[ptr/4],
      getInt = (ptr) => memory.heapi32s[ptr/4],
      getUInt = (ptr) => memory.heapi32u[ptr/4],
      getShort = (ptr) => memory.heapi16s[ptr/2],
      getUShort = (ptr) => memory.heapi16u[ptr/2],
      getByte = (ptr) => memory.heapi8s[ptr],
      getUByte = (ptr) => memory.heapi8u[ptr],
      getFloat = (ptr) => memory.heapf32[ptr/4],
      getDouble = (ptr) => memory.heapf64[ptr/8],
      isDefined = (val) => (val != undefined && val != null),
      encode_handle = (ptr, val) => { setUInt(ptr, spasm.addObject(val)); },
      decode_handle = (ptr) => { return spasm.objects[getUInt(ptr)]; },
      spasm_encode_string = encoder.string,
      spasm_decode_string = decoder.string,
      spasm_indirect_function_get = (ptr)=>spasm.instance.exports.__indirect_function_table.get(ptr),
  spasm_decode_handle = decode_handle,
  spasm_decode_sequence = decode_handle;
`;
    const typePredicates = extractTypePredicatesFromDeclarations(declarations);
    const types = extractTypesFromDeclarations(declarations);
    const encoders = getEncoders(types.encoders, typePredicates);
    const decoders = getDecoders(types.decoders);
    const exportOpening = `export let jsExports = { '${packageName}': {`
    const exports = declarations.map(declaration => {
        switch (declaration.declaration) {
            case 'function': return functionToString(declaration);
            case 'struct': return structToString(declaration);
        }
    }).filter(d => !!d).join(",\n");
    const exportClosing = `} };`
    return [prefix, encoders, decoders, exportOpening, exports, exportClosing].filter(i => !!i).join("\n");
}

interface TypeInterfaces {
    encoders: ir.Type[]
    decoders: ir.Type[]
}

interface TypePredicate {
    queryType: ir.Type
    resultType: ir.Type
    functionName: string
}

function extractTypePredicatesFromDeclarations(declarations: ir.Declaration[]) : TypePredicate[] {
    return declarations.map(declaration => {
        switch (declaration.declaration) {
            case 'function':
                if (declaration.returnType.type === 'predicate')
                    return {functionName: declaration.name, queryType: declaration.parameters[0].type, resultType: declaration.returnType}
        }
    }).filter(d => !!d)
}

function extractTypesFromFunction(func: ir.Function) : TypeInterfaces {
    return {encoders: [func.returnType],
            decoders: func.parameters.map(p => p.type)};
}

function extractTypesFromStruct(declaration: ir.Struct) : TypeInterfaces {
    return declaration.members.map(member => {
        switch(member.memberType) {
            case 'method':
                return {encoders: [member.returnType],
                        decoders: member.parameters.map(p => p.type)};
            case 'property':
                return {encoders: [member.type],
                        decoders: [member.type]};
        }
    })
        .filter(t => !!t)
        .reduce((a,b) => ({encoders: a.encoders.concat(b.encoders).filter(e => !!e),
                           decoders: a.decoders.concat(b.decoders).filter(d => !!d)}));
}

export function extractBaseTypes(types: ir.Type[]) : ir.Type[] {
    return types.map(type => {
        switch (type.type) {
            case 'union':
                return type.types.concat(extractBaseTypes(type.types));
            case 'optional':
                return [type.baseType].concat(extractBaseTypes([type.baseType]));
            case 'array':
                return [type.elementType].concat(extractBaseTypes([type.elementType]));
        }
    }).filter(t => !!t).reduce((acc, items) => (acc.concat(items)), []);
}

export function extractTypesFromDeclarations(declarations: ir.Declaration[]) : TypeInterfaces {
    const interfaces = declarations.map(declaration => {
        switch (declaration.declaration) {
            case 'function': return extractTypesFromFunction(declaration);
            case 'struct': return extractTypesFromStruct(declaration);
        }
    }).filter(d => !!d)
        .reduce((a,b) => ({encoders: a.encoders.concat(b.encoders).filter(e => !!e),
                           decoders: a.decoders.concat(b.decoders).filter(d => !!d)}));
    return {encoders: interfaces.encoders.concat(extractBaseTypes(interfaces.encoders)).filter(t => !isLiteralOrUndefinedType(t)),
            decoders: interfaces.decoders.concat(extractBaseTypes(interfaces.decoders)).filter(t => !isLiteralOrUndefinedType(t))};
}

interface NamedType {
    name: string
    type: ir.Type
}

function dedupeNamedTypes(types: NamedType[]) : NamedType[] {
    return types.sort((a,b) => a.name < b.name ? -1 : +(b.name > a.name)+1)
        .reduce((acc,item)=>{
            if (acc.length == 0 || acc[acc.length-1].name !== item.name)
                acc.push(item);
            return acc;
        },[])
}

function typeNeedsEncodingFunction(type: ir.Type) : boolean {
    const defaultEncoders = ["spasm_encode_string", "spasm_encode_handle"];
    if (hasTypeGotHandle(type) || canTypeBeReturned(type))
        return false;
    const encoderName = getTypeEncoderName(type);
    return !defaultEncoders.find(e => e === encoderName);
}

function getEncoders(types: ir.Type[], typePredicates: TypePredicate[]) : string {
    const encoders = dedupeNamedTypes(types.filter(typeNeedsEncodingFunction).map(type => ({name: getTypeEncoderName(type), type})))
        .filter(d => !hasTypeGotHandle(d.type) && !canTypeBeReturned(d.type))
        .map(d => generateEncoder(d, typePredicates));

    if (encoders.length == 0)
        return '';
    return `const ${encoders};`;
}

function getTypeEncoderFunction(type: ir.Type) : string {
    const bindingType = getBindingType(type);
    if (bindingType.type === 'keyword') {
        switch (bindingType.name) {
            case 'double': return `setDouble`;
            case 'bool': return `setBool`;
        }
    }
    return getTypeEncoderName(bindingType)
}

interface IndexedPredicate {
    index: number
    type: ir.Type
    expression: string
}

interface IndexedType {
    index: number
    type: ir.Type
}

interface LiteralProperty {
    name: string
    type: ir.LiteralType | ir.LiteralUnionType | ir.OptionalType
}

interface CommonInterfaceTypes {
    literalPropertyName: string
    types: IndexedType[]
    literals: (ir.LiteralType | ir.LiteralUnionType | ir.OptionalType)[]
}

function getLiteralProperties(type: ir.Type) : LiteralProperty[] {
    if (type.type === 'reference') {
        const declaration = type.declaration();
        if (declaration.declaration === 'struct') {
            const properties = (declaration.members.filter(m => m.memberType === 'property') as ir.Property[])
            return properties
                .filter(m => m.type.type === 'literal' || m.type.type === 'literalunion' || (m.type.type === 'optional' && (m.type.baseType.type === 'literal' || m.type.baseType.type === 'literalunion')))
                .map(m => ({name: m.name, type: (m.type as ir.LiteralType | ir.LiteralUnionType | ir.OptionalType)}))
        }
    } else if (type.type === 'intersection') {
        return type.types.map(getLiteralProperties).reduce((acc,item)=>acc.concat(item));
    } else {
        console.warn("cant get literal properties from type", type)
    }
    return []
}

function findInterfacesWithCommonLiteralProperty(types: IndexedType[]) : CommonInterfaceTypes[] {
    interface Helper {
        type: IndexedType
        literalProperties: LiteralProperty[]
    }
    const litTypes: Helper[] = types.map(t => ({type: t, literalProperties: getLiteralProperties(t.type)}))
    for(var i = 0; i < litTypes.length - 1; i++) {
        const current = litTypes[i];
        const others = litTypes.slice(i+1);
        const commonProps : CommonInterfaceTypes[] = current.literalProperties.map(literalProperty => {
            const commonTypes = others.filter(other => other.literalProperties.some(p => p.name === literalProperty.name));
            if (commonTypes.length > 0)
                return { literalPropertyName: literalProperty.name, types: [current.type].concat(commonTypes.map(c => c.type)), literals: [literalProperty.type].concat(commonTypes.map(t => t.literalProperties.find(p => p.name === literalProperty.name).type)) };
        }).filter(p => !!p)
        if (commonProps.length > 0)
            return commonProps;
    }
    return [];
}

function getInterfaceLiteralTypeGuard(literal: ir.LiteralType | ir.LiteralUnionType | ir.OptionalType, propertyName: string, identifier: string): string {
    if (literal.type === 'literal')
        return `${identifier}.${propertyName} === ${literal.name}`;
    if (literal.type === 'literalunion') {
        const expression = literal.types.map(t => `${identifier}.${propertyName} === ${t.name}`).join(" || ");
        return `(${expression})`
    }
    if (literal.type === 'optional') {
        if (literal.baseType.type === 'literal' || literal.baseType.type === 'literalunion')
            return `${getInterfaceLiteralTypeGuard(literal.baseType, propertyName, identifier)} || ${identifier}.${propertyName} == undefined`;
        throw new Error(`Unable to get literal typeguard of type ${literal.baseType.type}`)
    }
}

function getTypePredicates(type: ir.UnionType, identifier: string, typePredicates: TypePredicate[]) : IndexedPredicate[] {
    // something there are type predicates in the typings, we can use those to match on the type
    // for simple type we use simple checks, for types referenced from the std we can use instanceof
    // from types created from classes we can use instanceof
    // otherwise we have to determine the defining feature between types
    const indexedTypes: IndexedType[] = type.types.map((type,index) => ({index, type}));
    let predicates: IndexedPredicate[] = indexedTypes.map(type => {
        switch (type.type.type) {
            case 'keyword': {
                switch (type.type.name) {
                    case 'string': return {index: type.index, expression: `((typeof ${identifier} === 'string') || (${identifier} instanceof String))`, type: type.type};
                    case 'double':
                        return {index: type.index, expression: `(typeof ${identifier} === 'number')`, type: type.type};
                        // TODO: probably some are missing...
                }
                break;
            }
            case 'reference': {
                const declaration = type.type.declaration();
                // if declaration comes from the standard library bindings, we assume it is a web host object and can do a simple instanceof
                if (declaration.sourceFile.indexOf('/node_modules/typescript/lib/') !== -1)
                    return {index: type.index, expression: `(${identifier} instanceof ${type.type.name})`, type: type.type};
                // TODO: if is class we can do a instanceof as well (or constructor)
            }
        }
    }).filter(p => !!p);
    let remainingTypes = indexedTypes.filter(i => !predicates.some(p => p.index === i.index));

    // first option is to find interfaces that have a common property with a literal type
    while (remainingTypes.length > 0) {
        const commonLiterals = findInterfacesWithCommonLiteralProperty(remainingTypes);
        if (commonLiterals.length > 0) {
            const commonLiteral = commonLiterals[0]; // we only check the first, its rare the second one is usefull
            const additionalPredicates = commonLiteral.types.map((t, idx) => {
                const literal = commonLiteral.literals[idx];
                const expression = getInterfaceLiteralTypeGuard(literal, commonLiteral.literalPropertyName, identifier);
                return {index: t.index, type: t.type, expression};
            });
            if (additionalPredicates.length > 0) {
                predicates = predicates.concat(additionalPredicates);
                remainingTypes = remainingTypes.filter(t => !additionalPredicates.some(p => p.index === t.index));
            }
        }
        break;
    }
    // then look at type predicates from the code
    remainingTypes = remainingTypes.filter(t => {
        const predicate = typePredicates.find(predicate => predicate.resultType.fqn === t.type.fqn);
        if (!predicate)
            return true; // found no predicate, so we keep it
        predicates.push({index: t.index, type: t.type, expression: `${predicate.functionName}(${identifier})`})
    })
    // we can allow one predicate to be missing, but we need to move it to the last of the list
    if (remainingTypes.length < 2) {
        return predicates.concat(remainingTypes.map(t => ({index: t.index, type: t.type, expression: 'true'})));
    }

    if (remainingTypes.length > 0) {
        return predicates.concat(remainingTypes.map(t => ({type: t.type, index: t.index, expression: '<insert manual type predicate>'})))
    }
    return predicates;
}

function generateEncoder(encoder: NamedType, typePredicates: TypePredicate[]) : string {
    const type = getBindingType(encoder.type);
    switch (type.type) {
        case 'predicate': throw new Error("no need to decode predicate type");
        case 'keyword':
            // TODO: do Any and BigInt
            return `${encoder.name} = (ptr, val) => {\n todo keyword ${type.name}\n}`;;
        case 'reference':
            const declaration = type.declaration()
            switch (declaration.declaration) {
                case 'struct':
                    return `${declaration.name} = spasm_encode_handle`; // TODO: mangle template args as well
                case 'alias':
                    return generateEncoder({name: getTypeEncoderName(type), type: declaration.type}, typePredicates); // TODO: mangle template args as well
                case 'enum':
                    if (encoder.name === "spasm_encode_string")
                        return;
                    throw new Error("Enums are either passed via int or via string (spasm_encode_string)")
                case 'typeparameter': return declaration.name; // TODO: what about this?
            }
            console.warn(declaration);
            throw new Error("missing type encoder")
        case 'union': {
            const predicates = getTypePredicates(type, 'val', typePredicates)
            const parts = predicates.map(pred => {
                const type = pred.type;
                const idx = pred.index;
                const predicate = pred.expression;
                return (`if (${predicate}) {\n` +
                        `        setUInt(ptr, ${idx})\n` +
                        `        ${getTypeEncoderFunction(type)}(ptr+4, val);\n` +
                        `    }`);
            }).join("else ");
            return (`${encoder.name} = (ptr, val) => {\n`+
                    `    ${parts}\n`+
                    `}`)
        }
        case 'intersection': return `${encoder.name} = (ptr, val) => {\n todo intersection\n}`;
        case 'literalunion': {
            // TODO: literalunion is probably passed same as enum
            const values = `const vals = [${type.types.map(type => type.name).join(", ")}];`;
            return (`${encoder.name} = (ptr, val) => {\n` +
                    `    ${values};\n` +
                    `    return vals[ptr];\n` +
                    `}`);
        }
        case 'mapped': return `${encoder.name} = (ptr, val) => {\n todo mapped\n}`;
        case 'optional':
            // TODO: determine size of base type
            const sizeOfBase = 4;
            return (`${encoder.name} = (ptr, val) => {\n` +
                    `    if (setBool(ptr+${sizeOfBase}, isDefined(val)))\n` +
                    `        ${getTypeEncoderFunction(type.baseType)}(ptr, val);\n` +
                    `}`);
        case 'function': return `${encoder.name} = (ptr, val) => {\n // TODO: implement encoder for function\n}`;
        case 'unknown': return `unknown`; // TODO: can't actually happen, throw in future
        case 'literal': throw new Error("Cannot decode literal types")
        case 'array': {
            if (type.elementType.type === 'keyword') {
                switch (type.elementType.name) {
                    // case 'number':
                    case 'double': return (`${encoder.name} = (ptr, val) => {\n` +
                                           `    const len = val.length;\n` +
                                           `    const offset = spasm.alloc(len * 8);` +
                                           `    setUInt(ptr, len);\n` +
                                           `    setUInt(ptr+4, offset);\n` +
                                           `    // todo, actually set the floats\n` +
                                           `}`);
                }
            }
            // TODO: determine size of element type
            const sizeOfElement = 4;
            // TODO: if it is a PDO we can proxy it (although we have to somehow prevent the memory from being freed in D)
            return (`${encoder.name} = (ptr, val) => {\n` +
                    `    const len = val.length;\n` +
                    `    const offset = spasm.alloc(len * ${sizeOfElement});` +
                    `    setUInt(ptr, len);\n` +
                    `    setUInt(ptr+4, offset);\n` +
                    `    for(var i = 0; i < len; i++) {\n` +
                    `        ${getTypeEncoderFunction(type.elementType)}(offset + (i * ${sizeOfElement}), val[i]));\n` +
                    `    }\n` +
                    `}`);
        }
        case 'indexed': return `${encoder.name} = (ptr, val) => {\n todo indexed\n}`;
        case 'instantiated':
            return generateEncoder({name: encoder.name, type: type.baseType}, typePredicates)
    }
    console.warn(encoder);
    throw new Error(`missing type encoder for ${type.type}`)
}

function typeNeedsDecodingFunction(type: ir.Type) : boolean {
    const defaultDecoders = ["spasm_decode_string", "spasm_decode_handle"];
    if (hasTypeGotHandle(type) || canTypeBeReturned(type))
        return false;
    const decoderName = getTypeDecoderName(type);
    return !defaultDecoders.find(e => e === decoderName);
}

export function getDecoders(types: ir.Type[]) : string {
    const decoders = dedupeNamedTypes(types.filter(typeNeedsDecodingFunction).map(type => ({name: getTypeDecoderName(type), type})))
        .map(generateDecoder).filter(d => !!d).join(",\n")

    if (decoders.length == 0)
        return '';
    return `const ${decoders};`;
}

function getTypeDecoderFunction(type: ir.Type) : string {
    const bindingType = getBindingType(type);
    if (bindingType.type === 'keyword') {
        switch (bindingType.name) {
            case 'double': return `getDouble`;
            case 'bool': return `getBool`;
        }
    }
    return getTypeDecoderName(bindingType)
}

function generateDecoder(decoder: NamedType) : string {
    const type = getBindingType(decoder.type);
    switch (type.type) {
        case 'predicate': throw new Error("no need to decode predicate type");
        case 'keyword':
            // TODO: do Any and BigInt
            return `${decoder.name} = (ptr) => {\n todo keyword ${type.name}\n}`;;
        case 'reference':
            const declaration = type.declaration()
            switch (declaration.declaration) {
                case 'struct':
                    return `${declaration.name} = spasm_decode_handle`; // TODO: mangle template args as well
                case 'alias':
                    return generateDecoder({name: getTypeDecoderName(type), type: declaration.type}); // TODO: mangle template args as well
                case 'enum':
                    if (decoder.name === "spasm_decode_string")
                        return;
                    throw new Error("Enums are either passed via int or via string (spasm_decode_string)")
                case 'typeparameter': return declaration.name; // TODO: what about this?
            }
            console.warn(declaration);
            throw new Error("missing type decoder")
        case 'union': {
            const parts = type.types.map(getBindingType).map((type, idx) => {
                return (`    if (getUInt(ptr) === ${idx})\n` +
                        `        return ${getTypeDecoderFunction(type)}(ptr+4);`);
            }).join("\n");
            return (`${decoder.name} = (ptr) => {\n`+
                    `${parts}\n`+
                    `}`)
        }
        case 'intersection': return `${decoder.name} = (ptr) => {\n todo\n}`;
        case 'literalunion': {
            const values = `const vals = [${type.types.map(type => type.name).join(", ")}];`;
            return (`${decoder.name} = (ptr) => {\n` +
                    `    ${values};\n` +
                    `    return vals[ptr];\n` +
                    `}`);
        }
        case 'mapped': return `${decoder.name} = (ptr) => {\n todo\n}`;
        case 'optional':
            // TODO: determine size of base type
            const sizeOfBase = 4;
            return (`${decoder.name} = (ptr) => {\n` +
                    `    if (getBool(ptr+${sizeOfBase}))\n` +
                    `        return ${getTypeDecoderFunction(type.baseType)}(ptr);\n` +
                    `}`);
        case 'function': return `${decoder.name} = (ptr) => {\n \\ TODO: implement decoder for function\n}`;
        case 'unknown': return `unknown`; // TODO: can't actually happen, throw in future
        case 'literal': throw new Error("Cannot decode literal types")
        case 'array': {
            if (type.elementType.type === 'keyword') {
                switch (type.elementType.name) {
                    // case 'number':
                    case 'double': return (`${decoder.name} = (len, offset) => {\n` +
                                           `    if (!offset) {\n` +
                                           `        offset = getUInt(len+4);\n` +
                                           `        len = getUInt(len);\n` +
                                           `    }\n` +
                                           `    return new Float64Array(spasm.memory.buffer, offet, len);\n` +
                                           `}`);
                }
            }
            // TODO: determine size of element type
            const sizeOfElement = 4;
            // TODO: if it is a PDO we can proxy it (although we have to somehow prevent the memory from being freed in D)
            return (`${decoder.name} = (len, offset) => {\n` +
                    `    if (!offset) {\n` +
                    `        offset = getUInt(len+1);\n` +
                    `        len = getUInt(len);\n` +
                    `    }\n` +
                    `    let data = [];\n` +
                    `    for(var i = 0; i < len; i++) {\n` +
                    `        data.push(${getTypeDecoderFunction(type.elementType)}(offset + (i * ${sizeOfElement})))\n` +
                    `    }\n` +
                    `}`);
        }
        case 'indexed': return `${decoder.name} = (ptr) => {\n todo\n}`;
        case 'instantiated': return (`${decoder.name} = (ptr) => {\n` +
                                     `    return ${getTypeDecoderFunction(type.baseType)}(ptr);` +
                                     `\n}`)
    }
    console.warn(decoder);
    throw new Error(`missing type decoder for ${type.type}`)
}

function templateParameterToString( arg: ir.TemplateParameter): string {
    return arg;
}

function templateParametersToString(args: ir.TemplateParameter[]) : string {
    if (args.length == 0)
        return '';
    return `(${args.map(t => templateParameterToString(t)).join(",")})`;
}

function parameterToString(param: ir.Parameter) : string {
    const bindingType = getBindingType(param.type)
    switch (bindingType.type) {
        case 'array': return `${param.name}Len, ${param.name}Off`
        case 'optional': return `${param.name}Defined, ${param.name}`
    }
    return `${param.name}`
}

function generateSourceDecoding(param: ir.Parameter) : string {
    if (hasTypeGotHandle(param.type))
        return `objects[${param.name}]`;
    if (canTypeBeReturned(param.type))
        return param.name;
    return decodeParameter(param);
}

function decodeParameter(param: ir.Parameter) : string {
    const decoder = getTypeDecoderName(param.type);
    switch (param.type.type) {
        case 'array': return `${decoder}(${param.name}Len, ${param.name}Off)`
        case 'optional':
            if (typeNeedsDecodingFunction(param.type))
                return `(${param.name}Defined ? ${getTypeDecoderFunction(param.type.baseType)}(${param.name}) : undefined)`
            return `(${param.name}Defined ? ${param.name} : undefined)`
    }
    return `${decoder}(${param.name})`;
}

function generateFunctionParameterNames(returnType: ir.Type, params: ir.Parameter[]) : string[] {
    if (canTypeBeReturned(returnType))
        return params.map(parameterToString)
    return ['rawResult'].concat(params.map(parameterToString));
}

function mangleTypeForDecoding(type: ir.Type) : string {
    // TODO: primitive types like int/float are simple as well
    switch (type.type) {
        case 'predicate': return 'predicate';
        case 'keyword':
            return type.name;
        case 'reference':
            const declaration = type.declaration()
            switch (declaration.declaration) {
                case 'struct':
                    return `handle`; // TODO: mangle template args as well
                case 'alias':
                    return mangleTypeForDecoding(getBindingType(declaration.type)); // TODO: mangle template args as well
                case 'enum':
                    if (declaration.members.every(m => m.type === "string"))
                        return `string`;
                    return 'unknown enum';//throw new Error("enums should not be encoded/decoded except for string enums");
                case 'typeparameter': return declaration.name; // TODO: what about this?
            }
            console.warn(declaration);
            throw new Error("missing type mangler")
        case 'union': return `union${type.types.length}_${type.types.map(mangleTypeForDecoding).join("_")}`
        case 'intersection': return `handle`;
        case 'literalunion':
            if (type.baseType !== 'string')
                throw new Error("Error: only literalunion of strings needs to be encoded/decoded");
            return `string`;
        case 'mapped': return `handle`;
        case 'optional': return `optional_${mangleTypeForDecoding(type.baseType)}`;
        case 'function': return `function_${mangleTypeForDecoding(type.returnType)}_${type.parameters.map(p => mangleTypeForDecoding(p.type)).join("_")}`;
        case 'unknown': return `unknown`; // TODO: can't actually happen, throw in future
        case 'literal': return getSafeIdentifier(type.name.replace("\"",""))
        case 'array': return `array_${mangleTypeForDecoding(type.elementType)}`;
        case 'indexed': return `indexed_`; // TODO: probably should resolve indexed types earlier
        case 'handle': return `handle`;
        case 'instantiated':
            return mangleTypeForDecoding(type.baseType);
    }
    console.warn(type);
    throw new Error("missing type mangler")
}

function getTypeDecoderName(type: ir.Type) : string {
    return `spasm_decode_${mangleTypeForDecoding(type)}`;
}

function mangleTypeForEncoding(type: ir.Type) : string {
    // TODO: primitive types like int/float are simple as well
    switch (type.type) {
        case 'predicate': return 'predicate';
        case 'keyword':
            return type.name;
        case 'reference':
            const declaration = type.declaration()
            switch (declaration.declaration) {
                case 'struct':
                    return type.name; // TODO: mangle template args as well
                case 'alias':
                    return mangleTypeForEncoding(getBindingType(declaration.type)); // TODO: mangle template args as well
                case 'enum':
                    if (declaration.members.every(m => m.type === "string"))
                        return `string`;
                    return 'unknown enum';//throw new Error("enums should not be encoded/decoded except for string enums");
                case 'typeparameter': return declaration.name; // TODO: what about this?
            }
            console.warn(declaration);
            throw new Error("missing type mangler")
        case 'union': return `union${type.types.length}_${type.types.map(mangleTypeForEncoding).join("_")}`
        case 'intersection': return `handle`;
        case 'literalunion':
            if (type.baseType !== 'string')
                throw new Error("Error: only literalunion of strings needs to be encoded/decoded");
            return `string`;
        case 'mapped': return `handle`;
        case 'optional': return `optional_${mangleTypeForEncoding(type.baseType)}`;
        case 'function': return `function_`; // TODO: handle functions
        case 'unknown': return `unknown`; // TODO: can't actually happen, throw in future
        case 'literal': return getSafeIdentifier(type.name.replace("\"",""))
        case 'array': return `array_${mangleTypeForEncoding(type.elementType)}`;
        case 'indexed': return `indexed_`; // TODO: probably should resolve indexed types earlier
        case 'handle': return `handle`;
        case 'instantiated':
            return `${type.name}_instantiated${type.templateArguments.length}_${type.templateArguments.map(mangleTypeForEncoding).join("_")}`;
    }
    console.warn(type);
    throw new Error("missing type mangler")
}

function getTypeEncoderName(type: ir.Type) : string {
    return `spasm_encode_${mangleTypeForEncoding(type)}`;
}

function generateResultEncoding(returnType: ir.Type, expression: string) : string {
    if (isVoid(returnType)) {
        return expression;
    }
    if (hasTypeGotHandle(returnType))
        return `return addObject(${expression})`
    if (canTypeBeReturned(returnType))
        return `return ${expression}`;
    const encoder = getTypeEncoderName(returnType);
    return `${encoder}(rawResult, ${expression})`;
}

function canTypeBeReturned(type: ir.Type) : boolean {
    if (isVoid(type))
        return true;
    if (hasTypeGotHandle(type))
        return true;
    // TODO: primitive types like int/float are simple as well
    switch (type.type) {
        case 'predicate': return true;
        case 'keyword':
            switch (type.name) {
                case 'string': return false;
                case 'bool': return true;
                case 'double': return true;
            }
            break;
        case 'reference':
            const declaration = type.declaration()
            switch (declaration.declaration) {
                case 'struct': return true;
                case 'alias':
                    return canTypeBeReturned(declaration.type)
                case 'enum':
                    return declaration.members.every(m => m.type === "number" || m.type === "enum");
                case 'typeparameter': return true; // TODO figure this out
            }
            break;
        case 'union': return false;
        case 'intersection': return true;
        case 'literalunion': return type.baseType !== 'string';
        case 'mapped': // TODO: does mapped need to be encoded?
            return false;
        case 'optional': return false;
        case 'function': return false; // TODO: handle functions
        case 'array': return false;
        case 'indexed': return true; // TODO: can it be returned?
    }
    console.warn(type);
    throw new Error("missing case for canTypeBeReturned")
}

function structMemberToString(member: ir.StructMember, struct: ir.Struct) : string {
    const selfParameter: ir.Parameter = {name: 'ctx', type: {type: 'handle', fqn: 'handle'}}
    switch(member.memberType) {
        case 'property': {
            if (isLiteralOrUndefinedType(member.type))
                return;
            const getMangledName = mangleMethod(struct, member, [], FunctionKind.getter);
            const propertyParameter: ir.Parameter = {name: member.name, type: member.type}
            const getLHS = `objects[ctx].${member.name}`;
            const getExpression = generateResultEncoding(member.type, getLHS);
            const getParameters = generateFunctionParameterNames(member.type, [selfParameter]).join(", ")
            const getter =
                `    ${getMangledName}: (${getParameters}) => {\n` +
                `        ${getExpression};\n`+
                `    }`
            const argument = functionParameterToArgument(propertyParameter)
            const setMangledName = mangleMethod(struct, member, [argument], FunctionKind.setter);
            const setLHS = `objects[ctx].${member.name}`;
            const setRHS = generateSourceDecoding(propertyParameter);
            const setter =
                `    ${setMangledName}: (ctx, ${parameterToString(propertyParameter)}) => {\n` +
                `        ${setLHS} = ${setRHS};\n`+
                `    }`
            return `${getter},\n${setter}`
        }
        case 'method':
            const bindingArguments = [functionParameterToArgument(selfParameter)].concat(member.parameters.map(functionParameterToArgument));
            const templateArguments = templateParametersToString(member.templateArguments);
            const parameters = generateFunctionParameterNames(member.returnType, member.parameters).join(", ")
            const mangledName = mangleMethod(struct, member, bindingArguments, FunctionKind.nomangle);
            const call = `objects[ctx].${member.name}(${member.parameters.map(generateSourceDecoding)})`;
            const expression = generateResultEncoding(member.returnType, call)
            return (`    ${mangledName}: (ctx, ${parameters}) => {\n`+
                    `        ${expression};\n`+
                    `    }`);
    }
}

function structToString(struct : ir.Struct) : string {
    if (struct.templateArguments.length > 0)
        return null;
    // TODO: handle templates
    let template = struct.templateArguments.map(t => templateParameterToString(t)).join(",")
    return struct.members.map(m => structMemberToString(m, struct)).filter(m => !!m).join(",\n");
}

function functionParameterToArgument(param: ir.Parameter) : ir.Argument {
    return {symbol: param.name, type: param.type}
}

function functionToString(func: ir.Function) : string {
    // TODO: wrap in template if templateParameters != null
    // const templateParameters = templateParametersToString(func.templateParameters);
    const bindingArguments = func.parameters.map(p => ({symbol: p.name, type: p.type}));
    const mangledName = mangleFunctionName(func.name, bindingArguments, FunctionKind.root);
    const parameters = generateFunctionParameterNames(func.returnType, func.parameters).join(", ")
    const call = `${func.name}(${func.parameters.map(generateSourceDecoding)})`;
    const expression = generateResultEncoding(func.returnType, call)
    return (`    ${mangledName}: (${parameters}) => {\n`+
            `        ${expression};\n`+
            `    }`);
}
