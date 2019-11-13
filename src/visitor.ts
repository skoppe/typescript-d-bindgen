import * as ts from 'typescript';

export interface Visitor<T> {
    visitInterface?: (decl: ts.InterfaceDeclaration) => T
    visitEnum?: (decl: ts.EnumDeclaration) => T
    visitFunctionDeclaration?: (decl: ts.FunctionDeclaration) => T
    visitPropertySignature?: (decl: ts.PropertySignature) => T
    visitTypeReference?: (decl: ts.TypeReferenceNode) => T
    visitKeywordType?: (decl: ts.KeywordTypeNode) => T
    visitLiteralType?: (decl: ts.LiteralTypeNode) => T
    visitUnionType?: (decl: ts.UnionTypeNode) => T
    visitMethodSignature?: (decl: ts.MethodSignature) => T
    visitTypeParameterDeclaration?: (decl: ts.TypeParameterDeclaration) => T
    visitParameterDeclaration?: (decl: ts.ParameterDeclaration) => T
    visitIndexedAccessType?: (type: ts.IndexedAccessTypeNode) => T
    visitArrayType?: (decl: ts.ArrayTypeNode) => T
    visitAliasDeclaration?: (decl: ts.TypeAliasDeclaration) => T
    visitMappedType?: (decl: ts.MappedTypeNode) => T
    visitFunctionType?: (decl: ts.FunctionTypeNode) => T
    visitIntersectionType?: (decl: ts.IntersectionTypeNode) => T
    visitParenthesizedType?: (decl: ts.ParenthesizedTypeNode) => T
    visitTypeOperator?: (decl: ts.TypeOperatorNode) => T
    visitConditionalType?: (type: ts.ConditionalTypeNode) => T
    visitTypeLiteral?: (type: ts.TypeLiteralNode) => T
    visitExportDeclaration?: (type: ts.ExportDeclaration) => T
    visitTypePredicateNode?: (type: ts.TypePredicateNode) => T
}

export function walkDeclarations<T>(decls: ReadonlyArray<ts.Node>, v: Visitor<T>) : T[] {
    if (decls == undefined)
        return [];
    const sourceFilesDecls = [].concat.apply([], decls.filter(d => ts.isSourceFile(d)).map(d => walkDeclarations((d as ts.SourceFile).statements, v)));

    return [].concat.apply(sourceFilesDecls, decls.filter(d => !ts.isSourceFile(d)).map((declaration)=>{
        if (ts.isInterfaceDeclaration(declaration))
            return v.visitInterface(declaration as ts.InterfaceDeclaration)
        else if (ts.isEnumDeclaration(declaration))
            return v.visitEnum(declaration as ts.EnumDeclaration)
        else if (ts.isFunctionDeclaration(declaration))
            return v.visitFunctionDeclaration(declaration as ts.FunctionDeclaration)
        else if (ts.isPropertySignature(declaration))
            return v.visitPropertySignature(declaration as ts.PropertySignature)
        else if (ts.isMethodSignature(declaration))
            return v.visitMethodSignature(declaration as ts.MethodSignature)
        else if (ts.isTypeParameterDeclaration(declaration)) {
            return v.visitTypeParameterDeclaration(declaration as ts.TypeParameterDeclaration);
        } else if (ts.isParameter(declaration)) {
            return v.visitParameterDeclaration(declaration as ts.ParameterDeclaration);
        } else if (ts.isTypeAliasDeclaration(declaration)) {
            return v.visitAliasDeclaration(declaration as ts.TypeAliasDeclaration);
        } else if (ts.isExportDeclaration(declaration)) {
            return v.visitExportDeclaration(declaration as ts.ExportDeclaration)
        }
        else
            console.log("no declaration visitor for kind", declaration.kind)
        return null;
    }).filter(d => !!d));
}

function isKeyword(type: ts.TypeNode): type is ts.KeywordTypeNode {
    return type.kind == ts.SyntaxKind.AnyKeyword || type.kind == ts.SyntaxKind.UnknownKeyword || type.kind == ts.SyntaxKind.NumberKeyword || type.kind == ts.SyntaxKind.BigIntKeyword || type.kind == ts.SyntaxKind.ObjectKeyword || type.kind == ts.SyntaxKind.BooleanKeyword || type.kind == ts.SyntaxKind.StringKeyword || type.kind == ts.SyntaxKind.SymbolKeyword || type.kind == ts.SyntaxKind.ThisKeyword || type.kind == ts.SyntaxKind.VoidKeyword || type.kind == ts.SyntaxKind.UndefinedKeyword || type.kind == ts.SyntaxKind.NullKeyword || type.kind == ts.SyntaxKind.NeverKeyword
}

export function walkTypes<T>(types: ReadonlyArray<ts.TypeNode>, v: Visitor<T>, def: T = undefined) : T[] {
    if (types == undefined)
        return [];
    return types.map(t => walkType(t, v, def));
}

export function walkType<T>(type: ts.TypeNode, v: Visitor<T>, def: T = undefined) : T {
    if (type == undefined)
        return def;
    if (ts.isTypeReferenceNode(type)) {
        return v.visitTypeReference(type as ts.TypeReferenceNode);
    } else if (isKeyword(type))
        return v.visitKeywordType(type as ts.KeywordTypeNode);
    else if (ts.isUnionTypeNode(type)) {
        return v.visitUnionType(type as ts.UnionTypeNode)
    } else if (ts.isLiteralTypeNode(type)) {
        return v.visitLiteralType(type as ts.LiteralTypeNode)
    } else if (ts.isIndexedAccessTypeNode(type)) {
        return v.visitIndexedAccessType(type as ts.IndexedAccessTypeNode)
    } else if (ts.isArrayTypeNode(type)) {
        return v.visitArrayType(type as ts.ArrayTypeNode)
    } else if (ts.isMappedTypeNode(type)) {
        return v.visitMappedType(type as ts.MappedTypeNode)
    } else if (ts.isFunctionTypeNode(type)) {
        return v.visitFunctionType(type as ts.FunctionTypeNode)
    } else if (ts.isIntersectionTypeNode(type)) {
        return v.visitIntersectionType(type as ts.IntersectionTypeNode)
    } else if (ts.isParenthesizedTypeNode(type)) {
        return v.visitParenthesizedType(type as ts.ParenthesizedTypeNode)
    } else if (ts.isTypeOperatorNode(type)) {
        return v.visitTypeOperator(type as ts.TypeOperatorNode)
    } else if (ts.isTypeLiteralNode(type)) {
        return v.visitTypeLiteral(type as ts.TypeLiteralNode)
    } else if (ts.isConditionalTypeNode(type)) {
        return v.visitConditionalType(type as ts.ConditionalTypeNode)
    } else if (ts.isTypePredicateNode(type)) {
        return v.visitTypePredicateNode(type as ts.TypePredicateNode)
    }
    else
        console.log("no type visitor for kind", type.kind);
    return def;
}

export function logVisitor(moduleName: string) : Visitor<void> {
    const visitor = {
        visitInterface: (decl: ts.InterfaceDeclaration) => {
            walkDeclarations(decl.members, visitor)
        },
        visitEnum: (decl: ts.EnumDeclaration) => {
        },
        visitFunctionDeclaration: (decl: ts.FunctionDeclaration) => {
        },
        visitPropertySignature: (decl: ts.PropertySignature) => {
            walkType(decl.type, visitor)
        },
        visitTypeReference: (type: ts.TypeReferenceNode) => {
        },
        visitKeywordType: (keyword: ts.KeywordTypeNode) => {
        },
        visitUnionType: (union: ts.UnionTypeNode) => {
            walkTypes(union.types, visitor);
        },
        visitLiteralType: (literal: ts.LiteralTypeNode) => {
        },
        visitMethodSignature: (method: ts.MethodSignature) => {
            walkDeclarations(method.parameters, visitor);
            walkDeclarations(method.typeParameters, visitor);
            walkType(method.type, visitor);
        },
        visitTypeParameterDeclaration: (decl: ts.TypeParameterDeclaration) => {
            walkType(decl.constraint, visitor)
            walkType(decl.default, visitor)
            // what about expression?
        },
        visitParameterDeclaration: (decl: ts.ParameterDeclaration) => {
            walkType(decl.type, visitor);
        },
        visitIndexedAccessType: (type: ts.IndexedAccessTypeNode) => {
            walkType(type.objectType, visitor)
            walkType(type.indexType, visitor)
        },
        visitArrayType: (type: ts.ArrayTypeNode) => {
            walkType(type.elementType, visitor)
        },
        visitAliasDeclaration: (decl: ts.TypeAliasDeclaration) => {
            walkDeclarations(decl.typeParameters, visitor);
            walkType(decl.type, visitor);
        },
        visitMappedType: (decl: ts.MappedTypeNode) => {
            visitor.visitTypeParameterDeclaration(decl.typeParameter);
            walkType(decl.type, visitor)
        },
        visitFunctionType: (decl: ts.FunctionTypeNode) => {
            walkDeclarations(decl.typeParameters, visitor)
            walkDeclarations(decl.parameters, visitor)
            walkType(decl.type, visitor)
        },
        visitIntersectionType: (decl: ts.IntersectionTypeNode) => {
            walkTypes(decl.types, visitor)
        },
        visitParenthesizedType: (decl: ts.ParenthesizedTypeNode) => {
            walkType(decl.type, visitor)
        },
        visitTypeOperator: (decl: ts.TypeOperatorNode) => {
            walkType(decl.type, visitor)
        },
        visitConditionalType: (type: ts.ConditionalTypeNode) => {
            walkType(type.checkType, visitor)
            walkType(type.extendsType, visitor)
            walkType(type.trueType, visitor)
            walkType(type.falseType, visitor)
        },
        visitTypeLiteral: (type: ts.TypeLiteralNode) => {
            walkDeclarations(type.members, visitor)
        },
        visitExportDeclaration: (decl: ts.ExportDeclaration) => {
        }

    }

    return visitor;
    // function visitExpression(expression: any) {
    //     if (expression.kind == ts.SyntaxKind.PropertyAccessExpression) {
    //         return `${expression.expression.escapedText}.${expression.name.escapedText}`;
    //     }
    //     return 'No can do!';
    // }

    // function visitName(name: any) {
        // if (name.kind == ts.SyntaxKind.ComputedPropertyName) {
    //         return `[${visitExpression(name.expression)}]`;
    //     } else
    //         return name;
    // }

    // function visitCallFunction(name: string, locals: any[]) : string {
    //     return `${name}(...)`;
    // }

    // function visitMember(value: any, name: any) : Member {
    //     const nameStr = visitName(name);
    //     if (value.flags & ts.SymbolFlags.Prototype){
    //         let member = {} as PropertyMember
    //         member.name = nameStr;
    //         member.optional = (value.flags & ts.SymbolFlags.Optional) > 0;
    //         member.type = visitType(value.type as any);
    //     } else if (value.flags & ts.SymbolFlags.Property){
    //         let member = {} as PropertyMember
    //         const propDecl = (value.valueDeclaration as any);
    //         member.name = nameStr;
    //         member.optional = (value.flags & ts.SymbolFlags.Optional) > 0;
    //         member.type = visitType(propDecl.type);
    //         return member;
    //     } else if (value.flags & ts.SymbolFlags.Method) {
    //         let member = {} as MethodMember
    //         const locals = (value.valueDeclaration as any).locals;
    //         member.name = nameStr;
    //         member.result = visitType(value.valueDeclaration.type as any)
    //         member.parameters = visitParameters(locals);
    //         return member;
    //     }
    // }

    // function visitParameters(params: any): Parameter[] {
    //     let result: Parameter[] = [];
    //     params.forEach((value: ts.Symbol, name: string) => {
    //         if ((value.valueDeclaration as any).questionToken ? "?" : "") {
    //             result.push({name, optional: true, type: visitType((value.valueDeclaration as any).type)} as Parameter)
    //         } else
    //             result.push({name, optional: false, type: visitType((value.valueDeclaration as any).type)} as Parameter)
    //     });
    //     return result;
    // }

    // function visitDeclaration(decl: any) {
    //     if (decl.type.kind == ts.SyntaxKind.VoidKeyword)
    //         return "void";
    //     // let postFix = decl.questionToken ? "?" : "";
    //     let postFix = "";

    //     switch (decl.type.kind as ts.SyntaxKind) {
    //         case ts.SyntaxKind.BooleanKeyword: return "bool";
    //         case ts.SyntaxKind.NumberKeyword: return "number";
    //         case ts.SyntaxKind.StringKeyword: return "string";
    //         default:
    //     }
    //     let result = visitType(decl.type);
    //     return result+postFix;
    // }
    // function visitTypeParameter(type: any): TypeParameter {
    //     return {name: type.name.escapedText, extends: type.constraint && visitType(type.constraint)} as TypeParameter
    // }
    // function visitTypeArgument(type: any) : TypeArgument {
    //     switch (type.kind as ts.SyntaxKind) {
    //         case ts.SyntaxKind.InferType:
    //             return {typeName: 'inferred', type: visitTypeParameter(type.typeParameter)}
    //         default:
    //             return visitType(type);
    //     }
    // }
    // function visitType(type: any): Type {
    //     switch(type.kind as ts.SyntaxKind) {
    //         case ts.SyntaxKind.LiteralType: {
    //             return visitLiteral(type.literal);
    //         } break;
    //         case ts.SyntaxKind.IntersectionType: {
    //             let types = type.types.map((t:any) => visitType(t));
    //             return {types,typeName: 'intersection'};
    //         }
    //         case ts.SyntaxKind.ParenthesizedType:
    //             return {typeName: 'parenthesized', type: visitType(type.type)}
    //             throw new Error("Unsupported paren type");
    //         case ts.SyntaxKind.TypeLiteral: {
    //             let result: Member[] = [];
    //             type.members.forEach((value:any)=>result.push(visitMember(value,value.name)));
    //             return {members: result, typeName: 'object'};
    //         }
    //         case ts.SyntaxKind.UnionType:
    //             let types = type.types.map((t:any) => visitType(t));;
    //             return {types, typeName: 'union'}
    //         case ts.SyntaxKind.ArrayType:
    //             let elementType = visitType(type.elementType);
    //             return {type: elementType, typeName: 'array'};
    //         case ts.SyntaxKind.IndexedAccessType:
    //             let reference = visitType(type.objectType)
    //             let index = visitType(type.indexType)
    //             if (!isTypeReference(reference) && !isTypeReference(index)) {
    //                 throw new Error("Expected typereference");
    //             }
    //             return {reference: reference as TypeReference,
    //                     index: index as TypeReference,
    //                     typeName: 'indexed'}
    //         case ts.SyntaxKind.TypeReference: {
    //             console.log(type);
    //             throw new Error("bla")
    //             // TODO: deal with identiferNames
    //             let typeArguments = (type.typeArguments as [] || []).map(visitTypeArgument);
    //             return {
    //                 typeName: 'reference',
    //                 reference: type.typeName.escapedText as string,
    //                 identifierNames: [],
    //                 typeArguments
    //             }
    //         } break;
    //         case ts.SyntaxKind.NullKeyword: return {typeName: 'predefined', type: 'null'};
    //         case ts.SyntaxKind.StringKeyword: return {typeName: 'predefined', type: 'string'};
    //         case ts.SyntaxKind.NumberKeyword: return {typeName: 'predefined', type: 'number'};
    //         case ts.SyntaxKind.BooleanKeyword: return {typeName: 'predefined', type: 'boolean'};
    //         case ts.SyntaxKind.VoidKeyword: return {typeName: 'predefined', type: 'void'};
    //         case ts.SyntaxKind.UndefinedKeyword: return {typeName: 'predefined', type: 'undefined'};
    //         case ts.SyntaxKind.MappedType:
    //             return {typeName: 'mapped',
    //                     typeParameter: visitTypeParameter(type.typeParameter),
    //                     optional: type.questionToken != undefined,
    //                     type: visitType(type.type)
    //                    }
    //         case ts.SyntaxKind.FunctionType:
    //             let typeParameters = (type.typeParameters as [] || []).map(visitTypeParameter);
    //             return {typeName: 'function',
    //                     params: visitParameters(type.locals),
    //                     typeParameters,
    //                     type: visitType(type.type)
    //                    }
    //         case ts.SyntaxKind.TypeOperator:
    //             if (type.operator != ts.SyntaxKind.KeyOfKeyword)
    //                 throw new Error("Unknown typeoperator");
    //             return {typeName: 'operator', operator: 'keyof', type: visitType(type.type) as TypeReference}
    //         case ts.SyntaxKind.ConditionalType:
    //             return {typeName: 'conditional',
    //                     checkType: visitType(type.checkType),
    //                     extendsType: visitType(type.extendsType),
    //                     trueType: visitType(type.trueType),
    //                     falseType: visitType(type.falseType)
    //                    }
    //         default:
    //             console.log(type);
    //             throw new Error(`Is this a type? ${type.kind}`);
    //     }
    // }

    // function visitOperator(op: ts.SyntaxKind) {
    //     switch(op) {
    //         case ts.SyntaxKind.KeyOfKeyword: return "keyof";
    //         default: return "*** dont know yet!";
    //     }
    // }
    // function visitLiteral(lit: any): Type {
    //     switch(lit.kind as ts.SyntaxKind) {
    //             // case ts.SyntaxKind.FirstLiteralToken
    //         case ts.SyntaxKind.TrueKeyword: return {typeName: 'literal', literal: {type: 'true', value: lit.text} }
    //         case ts.SyntaxKind.FalseKeyword: return {typeName: 'literal', literal: {type: 'false', value: lit.text} }
    //         case ts.SyntaxKind.NumericLiteral:
    //             return {typeName: 'literal', literal: {type: 'numeric', value: lit.text} }
    //         case ts.SyntaxKind.BigIntLiteral: {
    //             return {typeName: 'literal', literal: {type: 'bigint', value: lit.text} }
    //         } break;
    //         case ts.SyntaxKind.StringLiteral: {
    //             return {typeName: 'literal', literal: {type: 'string', value: lit.text} }
    //         } break;
    //         case ts.SyntaxKind.RegularExpressionLiteral: {
    //             return {typeName: 'literal', literal: {type: 'regex', value: lit.text} }
    //         } break;
    //             // case ts.SyntaxKind.NoSubstitutionTemplateLiteral: {
    //         case ts.SyntaxKind.LastLiteralToken: {
    //         } break;
    //         case ts.SyntaxKind.TypeLiteral: {
    //             throw new Error("no idea");
    //         } break;
    //         case ts.SyntaxKind.LiteralType: {
    //             throw new Error("no idea");
    //         } break;
    //         case ts.SyntaxKind.ArrayLiteralExpression: {
    //             return {typeName: 'literal', literal: {type: 'array', value: lit.text} }
    //         } break;
    //         case ts.SyntaxKind.ObjectLiteralExpression: {
    //             return {typeName: 'literal', literal: {type: 'object', value: lit.text} }
    //         } break;
    //         case ts.SyntaxKind.JSDocTypeLiteral: {
                
    //         } break;
    //     }
    // }

    // function visitTypeAlias(obj: ts.Symbol) : AliasDeclaration {
    //     const decl = obj.declarations[0] as any;
    //     const typeParameters: TypeParameter[] = decl.typeParameters && decl.typeParameters.map((p: any) => ({name: p.symbol.escapedName} as TypeParameter)) || [];
    //     return {name: decl.name.escapedText, typeParameters, target: visitType(decl.type), declaration: 'alias'}
    // }

    // function visitFunction(symbol: ts.Symbol) : FunctionDeclaration {
    //     const decl = symbol.valueDeclaration as ts.FunctionDeclaration
    //     throw new Error("asdf");
    //     // return {
    //     //     typeName: 'function',
    //     //     name: ,
    //     //     typeParameters: TypeParameter[]
    //     //     params: Parameter[]
    //     //     type: Type

    //     // }
    // }
    // function visitSymbol(symbol: ts.Symbol) : Declaration {
    //     if (symbol.flags & (ts.SymbolFlags.Interface)) {
    //         // if (name == "NonOverlaySeriesSpecificOptions") {
    //         return visitInterface(symbol);
    //         // }
    //     } else if (symbol.flags & (ts.SymbolFlags.TypeAlias)) {
    //         return visitTypeAlias(symbol);
    //     } else if (symbol.flags & ts.SymbolFlags.Function) {
    //         // return visitFunction(symbol);
    //     } else {
    //         // console.log(symbol)
    //         // throw new Error("No way to visit it")
    //     }
    // }
    // return {
    //     generate: (exports: ts.SymbolTable) => {
    //         let result: Declaration[] = [];
    //         exports.forEach((value,name)=>{
    //             result.push(visitSymbol(value));
    //         });
    //         return result;
    //     }
    // }
}
