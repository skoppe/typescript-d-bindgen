import * as ir from './ir';
import {hasTypeGotHandle, mangleFunctionName, mangleMethod, MangledName, FunctionKind, isNotVoid, isLiteralOrUndefinedType} from './utils'

export default function generateDWrapperCode(declarations: ir.Declaration[], packageName: string) : string {
    return declarations.map(declaration => {
        switch (declaration.declaration) {
            case 'alias': return aliasToString(declaration);
            case 'function': return functionToString(declaration);
            case 'struct': return structToString(declaration);
            case 'enum': return enumToString(declaration);
        }
    }).filter(d => !!d).join("\n\n");
}

function aliasToString(alias: ir.Alias) : string {
    const templates = templateParametersToString(alias.templateArguments)
    return `alias ${alias.name}${templates} = ${typeToString(alias.type, false)};`;
}

function templateArgumentsToString(arg: ir.Type[]) : string {
    if (arg.length == 0)
        return '';
    return `!(${arg.map(a => typeToString(a, false)).join(", ")})`;
}

function templateParameterToString( arg: ir.TemplateParameter): string {
    return arg;
}

function typeToString(type: ir.Type, optional: boolean) : string {
    switch (type.type) {
        case 'intersection': return `IntersectionType!(${type.types.map(t => typeToString(t, false)).join(", ")})`;
        case 'union': return `UnionType!(${type.types.map(t => typeToString(t, false)).join(", ")})`
        case 'literalunion': return `OneOf!(${type.types.map(t => typeToString(t, false)).join(", ")})`;
        case 'reference': return `${type.name}${templateArgumentsToString(type.templateArguments)}`;
        case 'unknown': return "Unknown";
        case 'literal': return type.name;
        case 'keyword': return type.name;
        case 'array': return `${typeToString(type.elementType, false)}[]`;
        case 'mapped': return `Mapped`;
        case 'function': return `${typeToString(type.returnType, false)} delegate(${type.parameters.map(p => parameterToString(p)).join(", ")})`;
        case 'conditional': return `Conditional`;
        case 'optional': return `Optional!(${typeToString(type.baseType, false)})`;
        case 'indexed': return `GetMemberType!(${typeToString(type.indexType, false)}, ${typeToString(type.objectType, false)})`
        case 'predicate': return 'bool';
    }
    throw new Error(`Cannot map type ${type.type} to string`);
}

function templateParametersToString(args: ir.TemplateParameter[]) : string {
    if (args.length == 0)
        return '';
    return `(${args.map(t => templateParameterToString(t)).join(",")})`;
}

function parameterToString(param: ir.Parameter) : string {
    return `${typeToString(param.type, param.optional)} ${param.name}`
}

function argumentToString(arg: ir.Argument) : string {
    if (hasTypeGotHandle(arg.type)) {
        return `${arg.symbol}.handle`;
    }
    return arg.symbol;
}

function generateBindingCall(mangledName: MangledName, args: ir.Argument[]) : string {
    const argsStr = args.map(argumentToString).join(", ")
    return `${mangledName}(${argsStr})`
}

function wrapBindingCallReturn(returnType: ir.Type, call: string) : string {
    if (hasTypeGotHandle(returnType)) {
        return `${typeToString(returnType, false)}(${call})`;
    }
    return call;
}

function wrapWithReturnIfNotVoid(returnType: ir.Type, call: string) : string {
    if (isNotVoid(returnType)) {
        return `return ${wrapBindingCallReturn(returnType, call)}`
    } else
        return call;
}

function structMemberToString(member: ir.StructMember, struct: ir.Struct) : string {
    const selfArgument: ir.Argument = {symbol: 'this.handle', type: {type: 'handle'}}
    switch(member.memberType) {
        case 'property': {
            if (isLiteralOrUndefinedType(member.type))
                return;
            const getMangledName = mangleMethod(struct, member, [], FunctionKind.getter);
            const bindingCall = generateBindingCall(getMangledName, [selfArgument]);
            const getter =
                `    ${typeToString(member.type, member.optional)} ${member.name}() {\n` +
                `        return ${wrapBindingCallReturn(member.type, bindingCall)};\n` +
                `    }`
            const argument = {symbol: member.name, type: member.type}
            const setMangledName = mangleMethod(struct, member, [argument], FunctionKind.setter);
            const setter =
                `    void ${member.name}(${typeToString(member.type, member.optional)} ${member.name}) {\n`+
                `        ${generateBindingCall(setMangledName, [selfArgument, argument])};\n` +
                `    }`
            return `${getter}\n${setter}`
        }
        case 'method':
            const bindingArguments = [selfArgument].concat(member.parameters.map(functionParameterToArgument));
            const templateArguments = templateParametersToString(member.templateArguments);
            const parameters = member.parameters.map(parameterToString).join(", ");
            const mangledName = mangleMethod(struct, member, bindingArguments, FunctionKind.nomangle);
            const bindingCall = wrapWithReturnIfNotVoid(member.returnType, generateBindingCall(mangledName, bindingArguments));
            return (`    ${typeToString(member.returnType, member.optional)} ${member.name}${templateArguments}(${parameters}) {\n` +
                    `        ${bindingCall};\n`+
                    `    }`
            );
    }
}

function structToString(struct : ir.Struct) {
    let template = struct.templateArguments.map(t => templateParameterToString(t)).join(",")
    if (template.length > 0)
        template = '(' + template + ')';
    let members = struct.members.map(m => structMemberToString(m, struct)).filter(m => !!m).join("\n");
    return (`struct ${struct.name}${template} {\n` +
            `    JsHandle _handle;\n` +
            `    alias _handle this;\n` +
            `    this(Handle handle) {\n` +
            `        this._handle = JsHandle(handle);\n` +
            `    }\n` +
            `${members}\n` +
            `}`)
}

function functionParameterToArgument(param: ir.Parameter) : ir.Argument {
    return {symbol: param.name, type: param.type}
}

function doesFunctionNeedWrapper(func: ir.Function) : boolean {
    const returnType = func.returnType;
    const returnTypeNeedsWrapper = isNotVoid(returnType) && hasTypeGotHandle(returnType);
    const paramNeedsWrapper = func.parameters.map(p => p.type).some(hasTypeGotHandle);
    return returnTypeNeedsWrapper || paramNeedsWrapper;
}

function functionToString(func: ir.Function) : string {
    if (!doesFunctionNeedWrapper(func))
        return '';
    const bindingArguments = func.parameters.map(p => ({symbol: p.name, type: p.type}));
    const templateParameters = templateParametersToString(func.templateParameters);
    const parameters = func.parameters.map(parameterToString).join(", ");
    const mangledName = mangleFunctionName(func.name, bindingArguments, FunctionKind.root);
    const bindingCall = wrapWithReturnIfNotVoid(func.returnType, generateBindingCall(mangledName, bindingArguments));
    return (`${typeToString(func.returnType, false)} ${func.name}${templateParameters}(${parameters}) {\n` +
            `    ${bindingCall};\n` +
            `}`);
}

function enumMemberToString(member: ir.EnumMember) : string {
    return `    ${member.name} = ${member.value}`;
}

function enumToString(enumeration: ir.Enum) : string {
    const members = enumeration.members.map(m => enumMemberToString(m)).join(",\n");
    return `enum ${enumeration.name} {\n${members}\n}`;
}
