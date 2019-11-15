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

export function iterateDeclarations<T>(decls: ReadonlyArray<ts.Node>, v: Visitor<T>) : T[] {
    if (decls == undefined)
        return [];
    const sourceFilesDecls = [].concat.apply([], decls.filter(d => ts.isSourceFile(d)).map(d => iterateDeclarations((d as ts.SourceFile).statements, v)));

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
        else if (ts.isTypeParameterDeclaration(declaration))
            return v.visitTypeParameterDeclaration(declaration as ts.TypeParameterDeclaration);
        else if (ts.isParameter(declaration))
            return v.visitParameterDeclaration(declaration as ts.ParameterDeclaration);
        else if (ts.isTypeAliasDeclaration(declaration))
            return v.visitAliasDeclaration(declaration as ts.TypeAliasDeclaration);
        else if (ts.isExportDeclaration(declaration))
            return v.visitExportDeclaration(declaration as ts.ExportDeclaration)
        else if (ts.isEmptyStatement(declaration))
            return;
        else
            throw new Error(`no declaration visitor for kind ${declaration.kind}`)
    }).filter(d => !!d));
}

export function iterateTypes<T>(types: ReadonlyArray<ts.TypeNode>, v: Visitor<T>, def: T = undefined) : T[] {
    if (types == undefined)
        return [];
    return types.map(t => iterateType(t, v, def)).filter(t => !!t);
}

export function iterateType<T>(type: ts.TypeNode, v: Visitor<T>, def: T = undefined) : T {
    if (type == undefined)
        return def;
    if (ts.isTypeReferenceNode(type))
        return v.visitTypeReference(type as ts.TypeReferenceNode);
    else if (isKeyword(type))
        return v.visitKeywordType(type as ts.KeywordTypeNode);
    else if (ts.isUnionTypeNode(type))
        return v.visitUnionType(type as ts.UnionTypeNode)
    else if (ts.isLiteralTypeNode(type))
        return v.visitLiteralType(type as ts.LiteralTypeNode)
    else if (ts.isIndexedAccessTypeNode(type))
        return v.visitIndexedAccessType(type as ts.IndexedAccessTypeNode)
    else if (ts.isArrayTypeNode(type))
        return v.visitArrayType(type as ts.ArrayTypeNode)
    else if (ts.isMappedTypeNode(type))
        return v.visitMappedType(type as ts.MappedTypeNode)
    else if (ts.isFunctionTypeNode(type))
        return v.visitFunctionType(type as ts.FunctionTypeNode)
    else if (ts.isIntersectionTypeNode(type))
        return v.visitIntersectionType(type as ts.IntersectionTypeNode)
    else if (ts.isParenthesizedTypeNode(type))
        return v.visitParenthesizedType(type as ts.ParenthesizedTypeNode)
    else if (ts.isTypeOperatorNode(type))
        return v.visitTypeOperator(type as ts.TypeOperatorNode)
    else if (ts.isTypeLiteralNode(type))
        return v.visitTypeLiteral(type as ts.TypeLiteralNode)
    else if (ts.isConditionalTypeNode(type))
        return v.visitConditionalType(type as ts.ConditionalTypeNode)
    else if (ts.isTypePredicateNode(type))
        return v.visitTypePredicateNode(type as ts.TypePredicateNode)
    else
        console.log("no type visitor for kind", type.kind);
    return def;
}

function isKeyword(type: ts.TypeNode): type is ts.KeywordTypeNode {
    return type.kind == ts.SyntaxKind.AnyKeyword || type.kind == ts.SyntaxKind.UnknownKeyword || type.kind == ts.SyntaxKind.NumberKeyword || type.kind == ts.SyntaxKind.BigIntKeyword || type.kind == ts.SyntaxKind.ObjectKeyword || type.kind == ts.SyntaxKind.BooleanKeyword || type.kind == ts.SyntaxKind.StringKeyword || type.kind == ts.SyntaxKind.SymbolKeyword || type.kind == ts.SyntaxKind.ThisKeyword || type.kind == ts.SyntaxKind.VoidKeyword || type.kind == ts.SyntaxKind.UndefinedKeyword || type.kind == ts.SyntaxKind.NullKeyword || type.kind == ts.SyntaxKind.NeverKeyword
}
