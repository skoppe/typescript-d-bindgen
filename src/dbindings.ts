import * as ir from './ir';
import {hasTypeGotHandle, mangleFunctionName, mangleMethod, FunctionKind, isLiteralOrUndefinedType, getBindingType} from './utils'

export default function generateDBindingCode(declarations: ir.Declaration[], packageName: string) : string {
    return declarations.map(declaration => {
        switch (declaration.declaration) {
            case 'function': return functionToString(declaration);
            case 'struct': return structToString(declaration);
        }
    }).filter(d => !!d).join("\n\n");
}

function templateArgumentsToString(arg: ir.Type[]) : string {
    if (arg.length == 0)
        return '';
    return `!(${arg.map(a => typeToString(a)).join(", ")})`;
}

function templateParameterToString( arg: ir.TemplateParameter): string {
    return arg;
}

function typeToString(type: ir.Type) : string {
    switch (type.type) {
        case 'intersection': return `IntersectionType!(${type.types.map(t => typeToString(t)).join(", ")})`;
        case 'union': return `UnionType!(${type.types.map(t => typeToString(t)).join(", ")})`
        case 'literalunion': return `OneOf!(${type.types.map(t => typeToString(t)).join(", ")})`;
        case 'reference': return `${type.name}${templateArgumentsToString(type.templateArguments)}`;
        case 'unknown': return "Unknown";
        case 'literal': return type.name;
        case 'keyword': return type.name;
        case 'array': return `uint, uint`;
        case 'mapped': return `Mapped`;
        case 'function': return `${typeToString(type.returnType)} delegate(${type.parameters.map(p => parameterToString(p)).join(", ")})`;
        case 'conditional': return `Conditional`;
        case 'optional': return `Optional!(${typeToString(type.baseType)})`;
        case 'indexed': return `GetMemberType!(${typeToString(type.indexType)}, ${typeToString(type.objectType)})`
        case 'predicate': return 'bool';
        case 'instantiated': return `${type.name}${templateArgumentsToString(type.templateArguments)}`;
        case 'handle': return 'Handle';
    }
    throw new Error(`Cannot map type ${type} to string`);
}

function templateParametersToString(args: ir.TemplateParameter[]) : string {
    if (args.length == 0)
        return '';
    return `(${args.map(t => templateParameterToString(t)).join(",")})`;
}

function parameterToString(param: ir.Parameter) : string {
    const bindingType = getBindingType(param.type)
    switch (bindingType.type) {
        case 'optional': return `bool, ${parameterToString({type: bindingType.baseType, name: param.name})}`
    }
    return `${typeToString(bindingType)}`
}

function structMemberToString(member: ir.StructMember, struct: ir.Struct) : string {
    const selfParameter: ir.Parameter = {name: 'self', type: {type: 'handle', fqn: 'handle'}}
    switch(member.memberType) {
        case 'property': {
            if (isLiteralOrUndefinedType(member.type))
                return;
            const getMangledName = mangleMethod(struct, member, [], FunctionKind.getter);
            const propertyParameter: ir.Parameter = {name: member.name, type: member.type}
            const result = typeToString(member.type)
            const getter = `extern (C) ${result} ${getMangledName}(Handle);`
            const argument = functionParameterToArgument(propertyParameter)
            const setMangledName = mangleMethod(struct, member, [argument], FunctionKind.setter);
            const setter = `extern (C) void ${setMangledName}(Handle, ${parameterToString(propertyParameter)});`
            return `${getter}\n${setter}`
        }
        case 'method':
            const bindingArguments = [functionParameterToArgument(selfParameter)].concat(member.parameters.map(functionParameterToArgument));
            const templateArguments = templateParametersToString(member.templateArguments);
            const parameters = member.parameters.map(parameterToString).join(", ");
            const mangledName = mangleMethod(struct, member, bindingArguments, FunctionKind.nomangle);
            const result = typeToString(member.returnType)
            return `extern (C) ${result} ${mangledName}(${parameters});`
    }
}

function structToString(struct : ir.Struct) {
    let template = struct.templateArguments.map(t => templateParameterToString(t)).join(",")
    if (template.length > 0)
        template = '(' + template + ')';
    return struct.members.map(m => structMemberToString(m, struct)).filter(m => !!m).join("\n");
}

function functionParameterToArgument(param: ir.Parameter) : ir.Argument {
    return {symbol: param.name, type: param.type}
}

function functionToString(func: ir.Function) : string {
    // TODO: wrap in template if templateParameters != null
    // const templateParameters = templateParametersToString(func.templateParameters);
    const result = typeToString(func.returnType);
    const bindingArguments = func.parameters.map(p => ({symbol: p.name, type: p.type}));
    const mangledName = mangleFunctionName(func.name, bindingArguments, FunctionKind.root);
    const parameters = func.parameters.map(parameterToString).join(", ");
    return `extern (C) ${result} ${mangledName}(${parameters});`
}
