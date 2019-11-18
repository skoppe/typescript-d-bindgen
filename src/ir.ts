import * as ts from 'typescript';
import {Visitor, iterateDeclarations, iterateTypes, iterateType} from './visitor'
import {fromSingleToDoubleQuoted} from './utils'

export type TemplateParameter = string
export type StructMember = Method | Property;
export type Declaration = Struct | Enum | Alias | Function | TypeParameter | UnknownDeclaration;

export type Type = IntersectionType | UnionType | ReferenceType | UnknownType | LiteralType | KeywordType | ArrayType | MappedType | FunctionType | ConditionalType | OptionalType | IndexedType | HandleType | LiteralUnionType | TypePredicateType | InstantiatedType;

// TODO: for better error messages and diagnostics we can include the original source text in the types

export interface IntersectionType {
    type: 'intersection'
    types: Type[]
    fqn: string
}

export interface UnionType {
    type: 'union'
    types: Type[]
    fqn: string
}

export interface LiteralUnionType {
    type: 'literalunion'
    types: LiteralType[]
    fqn: string
    baseType: "string" | "number" | "bool"
}

export interface ReferenceType {
    type: 'reference'
    name: string
    templateArguments: Type[]
    declaration: () => Declaration
    fqn: string
}

export interface UnknownType {
    type: 'unknown'
    fqn: string
}

export interface LiteralType {
    type: 'literal'
    name: string
    fqn: string
    baseType: "string" | "number" | "bool"
}

export type Keyword = "double" | "Any" | "string" | "BigInt" | "bool" | "void" | "null" | "undefined"

export interface KeywordType {
    type: 'keyword'
    name: Keyword
    fqn: string
}

export interface ArrayType {
    type: 'array'
    elementType: Type
    fqn: string
}

export interface MappedType {
    type: 'mapped'
    fqn: string
}

export interface FunctionType {
    type: 'function'
    returnType: Type
    templateParameters: TemplateParameter[]
    parameters: Parameter[]
    fqn: string
}

export interface ConditionalType {
    type: 'conditional'
    checkType: Type
    extendsType: Type
    trueType: Type
    falseType: Type
    fqn: string
}

export interface OptionalType {
    type: 'optional'
    baseType: Type
    fqn: string
}

export interface IndexedType {
    type: 'indexed'
    objectType: Type
    indexType: Type
    map: Map<string, Type>
    fqn: string
}

export interface HandleType {
    type: 'handle'
    fqn: 'handle'
}

export interface InstantiatedType {
    type: 'instantiated'
    name: string
    baseType: Type
    templateArguments: Type[]
    fqn: string
}

export interface TypePredicateType {
    type: 'predicate'
    targetType: Type
    fqn: string
}

export interface Property {
    memberType: 'property'
    name: string
    type: Type
}

export interface Parameter {
    name: string
    type: Type
    // default: string  // TODO: handle default parameters as well
}

export interface Argument {
    symbol: string
    type: Type
}

export interface Method {
    memberType: 'method'
    name: string
    templateArguments: TemplateParameter[]
    parameters: Parameter[]
    returnType: Type
}

export interface Struct {
    declaration: 'struct'
    name: string
    baseType?: Struct
    templateArguments: TemplateParameter[]
    members: StructMember[]
    sourceFile: string
}

export interface Alias {
    declaration: 'alias'
    name: string
    templateArguments: TemplateParameter[]
    type: Type
    sourceFile: string
}

export interface Enum {
    declaration: 'enum'
    name: string
    members: EnumMember[]
    sourceFile: string
}

export interface Function {
    declaration: 'function'
    name: string
    templateParameters: TemplateParameter[]
    parameters: Parameter[]
    returnType: Type
    sourceFile: string
}

export interface TypeParameter {
    declaration: 'typeparameter'
    name: string
    constraint: Type | null
    def: Type | null
    sourceFile: string
}

export interface UnknownDeclaration {
    declaration: 'unknown'
    sourceFile: string
}

export type EnumMemberType = "number" | "string" | "enum"

export interface EnumMember {
    name: string
    value: string
    type: EnumMemberType
}

function memoize<T>(fun: () => T): () => T {
    let cache: T | null;
    return () => {
        if (cache === null)
            cache = fun();
        return cache;
    }
}

export function irVisitor(moduleName: string, typeChecker: ts.TypeChecker) : Visitor<Declaration> {
    const visitor = {
        visitInterface: (decl: ts.InterfaceDeclaration) : Declaration | null => {
            return buildStruct(decl);
        },
        visitEnum: (decl: ts.EnumDeclaration) : Declaration | null => {
            const members = decl.members.map(m => buildEnumMember(m));
            return {declaration: 'enum', name: decl.name.getText(), members, sourceFile: decl.getSourceFile().fileName}
        },
        visitFunctionDeclaration: (decl: ts.FunctionDeclaration) : Declaration | null => {
            const returnType = buildType(decl.type, !!decl.questionToken);
            const templateParameters = buildTemplateParameters(decl.typeParameters)
            const parameters = buildParameters(decl.parameters)
            return {declaration: 'function', name: decl.name.getText(), returnType, templateParameters, parameters, sourceFile: decl.getSourceFile().fileName}
        },
        visitTypeParameterDeclaration: (decl: ts.TypeParameterDeclaration) : Declaration | null => {
            const constraint: Type | null = decl.constraint && buildType(decl.constraint, false)
            const def: Type | null = decl.default && buildType(decl.default, false)
            return {declaration: 'typeparameter', name: decl.name.getText(), constraint, def, sourceFile: decl.getSourceFile().fileName}
        },
        visitAliasDeclaration: (decl: ts.TypeAliasDeclaration) : Declaration | null => {
            return buildAliasDeclaration(decl);
        },
        visitExportDeclaration: (decl: ts.ExportDeclaration) : Declaration | null => {
            return null;
        }

    }

    return visitor;

    function getReferencedDeclaration(type: ts.TypeReferenceNode) : () => Declaration {
        const referencedSymbol = typeChecker.getSymbolsInScope(type, ts.SymbolFlags.Type).filter(s => s.name == type.typeName.getText())[0]
        if (!referencedSymbol)
            throw new Error(`Cannot find symbol ${type.typeName.getText()}`);
        const declaration = referencedSymbol.declarations[0]
        // TODO: get memoize working...
        // return memoize(() => buildDeclaration(declaration));
        return () => buildDeclaration(declaration)
    }

    function buildDeclaration(declaration: ts.Declaration) : Declaration {
        declaration.getSourceFile().fileName
        return iterateDeclarations([declaration], visitor)[0]
    }

    function buildParameters(parameters: ReadonlyArray<ts.ParameterDeclaration>) : Parameter[] {
        return parameters.map(parameter => {
            return {type: buildType(parameter.type, !!parameter.questionToken), name: parameter.name.getText()}
        })
    }

    function buildTemplateArguments(typeArguments: ReadonlyArray<ts.TypeNode>) : Type[] {
        if (typeArguments === undefined)
            return [];
        return typeArguments.map(a => buildType(a, false));
    }

    function buildTemplateParameters(typeParameters: ReadonlyArray<ts.TypeParameterDeclaration>) : TemplateParameter[] {
        return (typeParameters || []).map(typeParameter => typeParameter.name.getText());
    }

    function getFqn(type: ts.TypeNode, fallbackName: string | null = null) : string {
        const symbol = typeChecker.getTypeFromTypeNode(type).symbol;
        if (symbol != null && symbol != undefined)
            return typeChecker.getFullyQualifiedName(symbol);

        if (fallbackName)
            return `"${type.getSourceFile().fileName}".${fallbackName}`
        return `"${type.getSourceFile().fileName}":${type.getFullStart()}:${type.getEnd()}`
    }
    function buildType(type: ts.TypeNode, optional: boolean) : Type {
        const visitor = {
            visitKeywordType: (keyword: ts.KeywordTypeNode): Type => {
                switch (keyword.kind) {
                    case ts.SyntaxKind.AnyKeyword: return {type:'keyword', name: 'Any', fqn: 'any'};
                    case ts.SyntaxKind.UnknownKeyword: throw new Error("unknown keyword not support");
                    case ts.SyntaxKind.NumberKeyword: return {type:'keyword', name: 'double', fqn: 'double'};
                    case ts.SyntaxKind.BigIntKeyword: return {type:'keyword', name: 'BigInt', fqn: 'BigInt'};
                    case ts.SyntaxKind.ObjectKeyword:throw new Error("object keyword not support");
                    case ts.SyntaxKind.BooleanKeyword: return {type:'keyword', name: 'bool', fqn: 'bool'};
                    case ts.SyntaxKind.StringKeyword: return {type:'keyword', name: 'string', fqn: 'string'};
                    case ts.SyntaxKind.SymbolKeyword:throw new Error("symbol keyword not support");
                    case ts.SyntaxKind.ThisKeyword:throw new Error("this keyword not support");
                    case ts.SyntaxKind.VoidKeyword: return {type:'keyword', name: 'void', fqn: 'void'};
                    case ts.SyntaxKind.UndefinedKeyword: return {type:'keyword', name: 'undefined', fqn: 'undefined'};
                    case ts.SyntaxKind.NullKeyword: return {type:'keyword', name: 'null', fqn: 'null'};
                    case ts.SyntaxKind.NeverKeyword:throw new Error("never keyword not support");
                }
                throw new Error("unknown keyword");
            },
            visitUnionType: (union: ts.UnionTypeNode): Type => {
                if (union.types.length == 2) {
                    const idx = union.types.findIndex(t => t.kind == ts.SyntaxKind.NullKeyword);
                    if (idx !== -1) {
                        return {type: 'optional', baseType: buildType(union.types[(idx + 1) % 2], false), fqn: getFqn(union)}
                    }
                }
                const types = iterateTypes<Type>(union.types, visitor, {type: 'unknown', fqn: 'unknown'})
                if (types.every(type => type.type === 'literal')) {
                    const literalTypes = types as LiteralType[];
                    if (literalTypes.some(t => t.baseType !== literalTypes[0].baseType))
                        throw new Error("Mixing of literal types is not supported");
                    return {type: 'literalunion', types: literalTypes, fqn: getFqn(union), baseType: literalTypes[0].baseType}
                }
                return {type: 'union', types: types, fqn: getFqn(union)}
            },
            visitLiteralType: (literal: ts.LiteralTypeNode): Type => {
                if (ts.isStringLiteral(literal.literal)) {
                    return {type:'literal', name: `"${fromSingleToDoubleQuoted(literal.getText().slice(1,-1))}"`, fqn: getFqn(literal), baseType: 'string'}
                } else if (ts.isNumericLiteral(literal.literal))
                    return {type:'literal', name: literal.getText(), fqn: getFqn(literal), baseType: 'number'}
                else if (literal.literal.kind === ts.SyntaxKind.TrueKeyword || literal.literal.kind === ts.SyntaxKind.FalseKeyword)
                    return {type:'literal', name: literal.getText(), fqn: getFqn(literal), baseType: 'bool'}
                else
                    throw new Error(`Literal ${literal.literal} is currently not supported`);
            },
            visitArrayType: (type: ts.ArrayTypeNode) : Type => {
                return {type:'array', elementType: buildType(type.elementType, false), fqn: getFqn(type)}
            },
            visitMappedType: (decl: ts.MappedTypeNode) : Type => {
                // TODO: map to ir
                // visitor.visitTypeParameterDeclaration(decl.typeParameter);
                // walkType(decl.type, visitor)
                return {type:'mapped', fqn: getFqn(decl)}
            },
            visitTypeReference: (type: ts.TypeReferenceNode) : Type => {
                const declaration = getReferencedDeclaration(type);
                const templateArguments = buildTemplateArguments(type.typeArguments)
                return {type:'reference', name: type.typeName.getText(), templateArguments, declaration, fqn: getFqn(type, type.typeName.getText())}
            },
            visitFunctionType: (decl: ts.FunctionTypeNode) : Type => {
                const parameters = buildParameters(decl.parameters)
                const templateParameters = buildTemplateParameters(decl.typeParameters)
                return {type:'function', returnType: buildType(decl.type, false), parameters, templateParameters, fqn: getFqn(decl)}
            },
            visitIntersectionType: (decl: ts.IntersectionTypeNode) : Type => {
                return {type:'intersection', types: iterateTypes(decl.types, visitor, {type: 'unknown', fqn: 'unknown'}), fqn: getFqn(decl)}
            },
            visitParenthesizedType: (decl: ts.ParenthesizedTypeNode) : Type => {
                return iterateType(decl.type, visitor, {type: 'unknown', fqn: 'unknown'})
            },
            visitTypeOperator: (decl: ts.TypeOperatorNode) : Type => {
                // TODO: map to ir
                // walkType(decl.type, visitor)
                return {type:'unknown', fqn: 'unknown'}
            },
            visitConditionalType: (type: ts.ConditionalTypeNode) : Type => {
                let checkType = buildType(type.checkType, false)
                let extendsType = buildType(type.extendsType, false)
                let trueType = buildType(type.trueType, false)
                let falseType = buildType(type.falseType, false)
                return {type:'conditional', checkType, extendsType, trueType, falseType, fqn: getFqn(type)}
            },
            visitTypeLiteral: (type: ts.TypeLiteralNode) : Type => {
                // walkDeclarations(type.members, visitor)
                return {type:'unknown', fqn: 'unknown'}
            },
            visitIndexedAccessType: (type: ts.IndexedAccessTypeNode) : Type => {
                const referencedType = (typeChecker.getTypeAtLocation(type));
                switch (referencedType.flags) {
                    case ts.TypeFlags.String: return {type: 'keyword', name: 'string', fqn: getFqn(type)}
                }
                if ((referencedType as any).objectType === undefined)
                    throw new Error(`Unable to evaluate indexed type ${type.getText()} with flag ${referencedType.flags}`);
                const members = (referencedType as any).objectType.members.entries();
                const map = new Map(Array.from(members, (entry: [string, ts.Symbol]) => [entry[0], buildType((entry[1].declarations[0] as any).type, false)]));
                let indexType = buildType(type.objectType, false)
                let objectType = buildType(type.indexType, false)
                return {type:'indexed', objectType, indexType, map, fqn: getFqn(type)}
            },
            visitTypePredicateNode: (type: ts.TypePredicateNode) : Type => {
                const targetType = buildType(type.type, false);
                return {type:'predicate', targetType, fqn: targetType.fqn}
            }
        }
        const baseType = iterateType<Type>(type, visitor, {type: 'unknown', fqn: 'unknown'});
        if (optional)
            return {type: 'optional', baseType, fqn: baseType.fqn}
        return baseType
    }

    function buildMethod(method: ts.MethodSignature) : Method {
        let name = method.name.getText();
        let templateArguments = buildTemplateParameters(method.typeParameters);
        let parameters = buildParameters(method.parameters);
        let returnType = buildType(method.type, !!method.questionToken);
        return {memberType: 'method', name, templateArguments, parameters, returnType}
    }

    function buildAliasDeclaration(decl: ts.TypeAliasDeclaration) : Alias {
        const type = buildType(decl.type, false)
        let templateArguments = buildTemplateParameters(decl.typeParameters);
        return {
            declaration: 'alias',
            templateArguments,
            name: decl.name.getText(),
            type,
            sourceFile: decl.getSourceFile().fileName
        };
    }

    function getEnumMemberType(member: ts.EnumMember) : EnumMemberType {
        const flags: ts.TypeFlags = typeChecker.getTypeAtLocation(member.initializer).flags | typeChecker.getTypeAtLocation(member).flags;
        if (flags & ts.TypeFlags.NumberLiteral)
            return "number";
        if (flags & ts.TypeFlags.Enum)
            return "enum";
        if (flags & ts.TypeFlags.StringLiteral)
            return "string";
        throw new Error(`Unsupported enum member type ${flags}`)
    }

    function buildEnumMember(member: ts.EnumMember) : EnumMember {
        const type = getEnumMemberType(member);
        return {
            name: member.name.getText(),
            value: member.initializer && member.initializer.getText() || `"${member.name.getText()}"`,
            type
        }
    }

    function buildStruct(decl: ts.InterfaceDeclaration) : Struct {
        const visitor = {
            visitMethodSignature(method: ts.MethodSignature) : StructMember {
                return buildMethod(method);
            },
            visitPropertySignature(decl: ts.PropertySignature) : StructMember {
                return {
                    memberType: 'property',
                    name: decl.name.getText(),
                    type: buildType(decl.type, !!decl.questionToken)
                }
            }
        }
        const name = decl.name.getText();
        const templateArguments = buildTemplateParameters(decl.typeParameters)
        const members = iterateDeclarations(decl.members, visitor);
        return {declaration: 'struct',
                name: name,
                templateArguments: templateArguments,
                members: members,
                sourceFile: decl.getSourceFile().fileName
               }
    }
}
