import * as ts from 'typescript';
import {Visitor, iterateDeclarations, iterateTypes, iterateType} from './visitor'

export type TemplateParameter = string
export type StructMember = Method | Property;
export type Declaration = Struct | Enum | Alias | Function | TypeParameter | UnknownDeclaration;

export type Type = IntersectionType | UnionType | ReferenceType | UnknownType | LiteralType | KeywordType | ArrayType | MappedType | FunctionType | ConditionalType | OptionalType | IndexedType | HandleType | LiteralUnionType | TypePredicate;

export interface IntersectionType {
    type: 'intersection'
    types: Type[]
}

export interface UnionType {
    type: 'union'
    types: Type[]
}

export interface LiteralUnionType {
    type: 'literalunion'
    types: LiteralType[]
}

export interface ReferenceType {
    type: 'reference'
    name: string
    templateArguments: Type[]
    declaration: () => Declaration
}

export interface UnknownType {
    type: 'unknown'
}

export interface LiteralType {
    type: 'literal'
    name: string
}

export interface KeywordType {
    type: 'keyword'
    name: string
}

export interface ArrayType {
    type: 'array'
    elementType: Type
}

export interface MappedType {
    type: 'mapped'
}

export interface FunctionType {
    type: 'function'
    returnType: Type
    templateParameters: TemplateParameter[]
    parameters: Parameter[]
}

export interface ConditionalType {
    type: 'conditional'
    checkType: Type
    extendsType: Type
    trueType: Type
    falseType: Type
}

export interface OptionalType {
    type: 'optional'
    baseType: Type
}

export interface IndexedType {
    type: 'indexed'
    objectType: Type
    indexType: Type
}

export interface HandleType {
    type: 'handle'
}

export interface TypePredicate {
    type: 'predicate'
}

export interface Property {
    memberType: 'property'
    name: string
    type: Type
    optional: boolean
}

export interface Parameter {
    name: string
    type: Type
    optional: boolean
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
    optional: boolean
}

export interface Struct {
    declaration: 'struct'
    name: string
    baseType?: Struct
    templateArguments: TemplateParameter[]
    members: StructMember[]
}

export interface Alias {
    declaration: 'alias'
    name: string
    templateArguments: TemplateParameter[]
    type: Type
}

export interface Enum {
    declaration: 'enum'
    name: string
    members: EnumMember[]
}

export interface Function {
    declaration: 'function'
    name: string
    templateParameters: TemplateParameter[]
    parameters: Parameter[]
    returnType: Type
}

export interface TypeParameter {
    declaration: 'typeparameter'
    name: string
    constraint: Type | null
    def: Type | null
}

export interface UnknownDeclaration {
    declaration: 'unknown'
}

export interface EnumMember {
    name: string
    value: string
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
            return {declaration: 'enum', name: decl.name.getText(), members}
        },
        visitFunctionDeclaration: (decl: ts.FunctionDeclaration) : Declaration | null => {
            const returnType = buildType(decl.type);
            const templateParameters = buildTemplateParameters(decl.typeParameters)
            const parameters = buildParameters(decl.parameters)
            return {declaration: 'function', name: decl.name.getText(), returnType, templateParameters, parameters}
        },
        visitTypeParameterDeclaration: (decl: ts.TypeParameterDeclaration) : Declaration | null => {
            const constraint: Type | null = decl.constraint && buildType(decl.constraint)
            const def: Type | null = decl.default && buildType(decl.default)
            return {declaration: 'typeparameter', name: decl.name.getText(), constraint, def}
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
        const declaration = referencedSymbol.declarations[0]
        // TODO: get memoize working...
        // return memoize(() => buildDeclaration(declaration));
        return () => buildDeclaration(declaration)
    }

    function buildDeclaration(declaration: ts.Declaration) : Declaration {
        return iterateDeclarations([declaration], visitor)[0]
    }

    function buildParameters(parameters: ReadonlyArray<ts.ParameterDeclaration>) : Parameter[] {
        return parameters.map(parameter => {
            return {type: buildType(parameter.type), name: parameter.name.getText(), optional: parameter.questionToken !== undefined}
        })
    }

    function buildTemplateArguments(typeArguments: ReadonlyArray<ts.TypeNode>) : Type[] {
        if (typeArguments === undefined)
            return [];
        return typeArguments.map(a => buildType(a));
    }

    function buildTemplateParameters(typeParameters: ReadonlyArray<ts.TypeParameterDeclaration>) : TemplateParameter[] {
        return (typeParameters || []).map(typeParameter => typeParameter.name.getText());
    }

    function buildType(type: ts.TypeNode) : Type {
        const visitor = {
            visitKeywordType: (keyword: ts.KeywordTypeNode): Type => {
                switch (keyword.kind) {
                    case ts.SyntaxKind.AnyKeyword: return {type:'keyword', name: 'Any'};
                    case ts.SyntaxKind.UnknownKeyword: throw new Error("unknown keyword not support");
                    case ts.SyntaxKind.NumberKeyword: return {type:'keyword', name: 'double'};
                    case ts.SyntaxKind.BigIntKeyword: return {type:'keyword', name: 'BigInt'};
                    case ts.SyntaxKind.ObjectKeyword:throw new Error("object keyword not support");
                    case ts.SyntaxKind.BooleanKeyword: return {type:'keyword', name: 'bool'};
                    case ts.SyntaxKind.StringKeyword: return {type:'keyword', name: 'string'};
                    case ts.SyntaxKind.SymbolKeyword:throw new Error("symbol keyword not support");
                    case ts.SyntaxKind.ThisKeyword:throw new Error("this keyword not support");
                    case ts.SyntaxKind.VoidKeyword: return {type:'keyword', name: 'void'};
                    case ts.SyntaxKind.UndefinedKeyword: return {type:'keyword', name: 'undefined'};
                    case ts.SyntaxKind.NullKeyword: return {type:'keyword', name: 'null'};
                    case ts.SyntaxKind.NeverKeyword:throw new Error("never keyword not support");
                }
                throw new Error("unknown keyword");
            },
            visitUnionType: (union: ts.UnionTypeNode): Type => {
                if (union.types.length == 2) {
                    const idx = union.types.findIndex(t => t.kind == ts.SyntaxKind.NullKeyword);
                    if (idx !== -1) {
                        return {type: 'optional', baseType: buildType(union.types[(idx + 1) % 2])}
                    }
                }
                const types = iterateTypes<Type>(union.types, visitor, {type: 'unknown'})
                if (types.every(type => type.type === 'literal'))
                    return {type: 'literalunion', types: types as LiteralType[]}
                return {type: 'union', types: types}
            },
            visitLiteralType: (literal: ts.LiteralTypeNode): Type => {
                let name: string = "";
                if (ts.isStringLiteral(literal.literal)) {
                    name += `"${literal.getText().slice(1,-1)}"`;
                } else
                    name += literal.getText();
                return {type:'literal', name}
            },
            visitArrayType: (type: ts.ArrayTypeNode) : Type => {
                return {type:'array', elementType: buildType(type.elementType)}
            },
            visitMappedType: (decl: ts.MappedTypeNode) : Type => {
                // TODO: map to ir
                // visitor.visitTypeParameterDeclaration(decl.typeParameter);
                // walkType(decl.type, visitor)
                return {type:'mapped'}
            },
            visitTypeReference: (type: ts.TypeReferenceNode) : Type => {
                const declaration = getReferencedDeclaration(type);
                const templateArguments = buildTemplateArguments(type.typeArguments)
                return {type:'reference', name: type.typeName.getText(), templateArguments, declaration}
            },
            visitFunctionType: (decl: ts.FunctionTypeNode) : Type => {
                const parameters = buildParameters(decl.parameters)
                const templateParameters = buildTemplateParameters(decl.typeParameters)
                return {type:'function', returnType: buildType(decl.type), parameters, templateParameters}
            },
            visitIntersectionType: (decl: ts.IntersectionTypeNode) : Type => {
                return {type:'intersection', types: iterateTypes(decl.types, visitor, {type: 'unknown'})}
            },
            visitParenthesizedType: (decl: ts.ParenthesizedTypeNode) : Type => {
                return iterateType(decl.type, visitor, {type: 'unknown'})
            },
            visitTypeOperator: (decl: ts.TypeOperatorNode) : Type => {
                // TODO: map to ir
                // walkType(decl.type, visitor)
                return {type:'unknown'}
            },
            visitConditionalType: (type: ts.ConditionalTypeNode) : Type => {
                let checkType = buildType(type.checkType)
                let extendsType = buildType(type.extendsType)
                let trueType = buildType(type.trueType)
                let falseType = buildType(type.falseType)
                return {type:'conditional', checkType, extendsType, trueType, falseType}
            },
            visitTypeLiteral: (type: ts.TypeLiteralNode) : Type => {
                // walkDeclarations(type.members, visitor)
                return {type:'unknown'}
            },
            visitIndexedAccessType: (type: ts.IndexedAccessTypeNode) : Type => {
                let indexType = buildType(type.objectType)
                let objectType = buildType(type.indexType)
                return {type:'indexed', objectType, indexType}
            },
            visitTypePredicateNode: (type: ts.TypePredicateNode) : Type => {
                return {type:'predicate'}
            }
        }
        return iterateType<Type>(type, visitor, {type: 'unknown'});
    }

    function buildMethod(method: ts.MethodSignature) : Method {
        let name = method.name.getText();
        let templateArguments = buildTemplateParameters(method.typeParameters);
        let parameters = buildParameters(method.parameters);
        let returnType = buildType(method.type);
        return {memberType: 'method', name, templateArguments, parameters, returnType, optional: method.questionToken !== undefined}
    }

    function buildAliasDeclaration(decl: ts.TypeAliasDeclaration) : Alias {
        const type = buildType(decl.type)
        let templateArguments = buildTemplateParameters(decl.typeParameters);
        return {
            declaration: 'alias',
            templateArguments,
            name: decl.name.getText(),
            type
        };
    }

    function buildEnumMember(member: ts.EnumMember) : EnumMember {
        return {
            name: member.name.getText(),
            value: member.initializer.getText()
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
                    type: buildType(decl.type),
                    optional: decl.questionToken !== undefined
                }
            }
        }
        const name = decl.name.getText();
        const templateArguments = buildTemplateParameters(decl.typeParameters)
        const members = iterateDeclarations(decl.members, visitor);
        return {declaration: 'struct',
                name: name,
                templateArguments: templateArguments,
                members: members}
    }
}
