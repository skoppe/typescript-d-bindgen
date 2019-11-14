import * as ir from './ir';

export function hasTypeGotHandle(type: ir.Type) : boolean {
    switch (type.type) {
        case 'intersection':
        case 'union':
            return false;
        case 'reference':
            const declaration = type.declaration();
            switch (declaration.declaration) {
                case 'struct': return true;
                case 'alias' : return hasTypeGotHandle(declaration.type)
                case 'enum' : return false;
            }
            throw new Error(`unknown declaration ${declaration.declaration}`)
        case 'array':
        case 'function': return false;
        case 'optional': return false;
        case 'handle': return false;
    }
    return false;
}

export enum FunctionKind {
    setter = 0,
    getter = 1,
    root = 2,
    nomangle = 3
}

export type Nominal<T, Name extends string> = T & { [Symbol.species]: Name; };

export type MangledName = Nominal<string, "MangledName">

export function mangleFunctionName(name: string, args: ir.Argument[], kind: FunctionKind) : MangledName {
    // TODO: for overloads we need to involve the args in the mangling
    function getPostfix() : string {
        switch (kind) {
            case FunctionKind.setter: return '_s';
            case FunctionKind.getter: return '_g';
            case FunctionKind.root: return '_r';
            case FunctionKind.nomangle: return '';
        }
        throw new Error(`Unable to get functionkind ${kind} postfix`)
    }
    return (name + getPostfix()) as MangledName;
}

export function mangleMethod(struct: ir.Struct, member: ir.StructMember, args: ir.Argument[], kind: FunctionKind) : MangledName {
    return mangleFunctionName(`${struct.name}_${member.name}`, args, kind)
}

export function isNotVoid(type: ir.Type) : boolean {
    return !isVoid(type);
}

export function isVoid(type: ir.Type) : boolean {
    return type.type === 'keyword' && type.name === 'void';
}

export function isLiteralOrUndefinedType(type: ir.Type) : boolean {
    if (type.type === 'literal')
        return true;
    if (type.type === 'keyword' && type.name === 'undefined')
        return true;
    if (type.type === 'optional')
        return isLiteralOrUndefinedType(type.baseType);
    return false;
}

export function getBindingType(type: ir.Type) : ir.Type {
    switch (type.type) {
        case 'intersection':
        case 'union': return type;
        case 'literalunion':// TODO: get literal type;
            return {type: 'keyword', name: 'string'}
            // throw new Error("Cannot pass literalunion types across boundary");
        case 'reference':
            const declaration = type.declaration()
            switch (declaration.declaration) {
                case 'struct': return {type: 'handle'};
                case 'alias':
                    if (hasTypeGotHandle(declaration.type))
                        return {type: 'handle'}
                    if (type.templateArguments.length == 0)
                        return type;
                    return {type:'instantiated', name: type.name, baseType: declaration.type, templateArguments: type.templateArguments}
                case 'enum': return type;
            }
        case 'unknown': console.log(type); throw new Error("Cannot pass unknown types across boundary");
        case 'literal': return type;
        case 'keyword': return type;
        case 'array': return type;
        case 'mapped': throw new Error("Cannot pass mapped types across boundary");
        case 'function': return type;
        case 'conditional': throw new Error("Cannot pass contional types across boundary")
        case 'optional': return type;
        case 'indexed': return type;//throw new Error("Cannot pass indexed types across boundary")
        case 'predicate': return {type: 'keyword', name: 'bool'};
        case 'handle': return type;
    }
    throw new Error(`Cannot get binding type for ${type.type}`);
}
