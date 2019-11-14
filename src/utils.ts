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
    return !(type.type === 'keyword' && type.name === 'void');
}
