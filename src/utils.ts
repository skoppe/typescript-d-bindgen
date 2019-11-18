import * as ir from './ir';
import * as ts from 'typescript';
import { iterateDeclarations } from './visitor';

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
                case 'typeparameter': return false; // TODO: how did this got here?
            }
            throw new Error(`unknown declaration ${declaration.declaration}`)
        case 'instantiated': return true;
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
        case 'literalunion': return {
            type: 'keyword',
            fqn: type.baseType as string,
            name: type.baseType as ir.Keyword
        }
        case 'reference':
            const declaration = type.declaration()
            switch (declaration.declaration) {
                case 'struct': return {type: 'handle', fqn: 'handle'};
                case 'alias':
                    if (hasTypeGotHandle(declaration.type))
                        return {type: 'handle', fqn: 'handle'}
                    if (type.templateArguments.length == 0)
                        return type;
                    return {type:'instantiated', name: type.name, baseType: declaration.type, templateArguments: type.templateArguments, fqn: `${type.fqn}<${type.templateArguments.map(t => t.fqn).join(",")}>`}
                case 'enum': return type;
                case 'typeparameter': return type;
            }
            console.log(type);
            throw new Error(`getBindingType not implemented for reference to ${declaration.declaration}`)
        case 'unknown': console.log(type); throw new Error("Cannot pass unknown types across boundary");
        case 'literal': return type;
        case 'keyword': return type;
        case 'array': return type;
        case 'mapped': return {type: 'handle', fqn: 'handle'}
        case 'function': return type;
        case 'conditional': throw new Error("Cannot pass contional types across boundary")
        case 'optional': return type;
        case 'indexed': return type;//throw new Error("Cannot pass indexed types across boundary")
        case 'predicate': return {type: 'keyword', name: 'bool', fqn: type.fqn};
        case 'handle': return type;
    }
    throw new Error(`Cannot get binding type for ${type.type}`);
}

// ***** move above section to ir.ts ***** //

interface TestFile {
    name: string
    content: string
}

function createTestCompilerHost(
    options: ts.CompilerOptions,
    files: TestFile[]
): ts.CompilerHost {
    return {
        getSourceFile,
        getDefaultLibFileName: () => "lib.d.ts",
        writeFile: (fileName, content) => {},
        getCurrentDirectory: () => '/',
        getDirectories: path => [],
        getCanonicalFileName: fileName => fileName,
        getNewLine: () => ts.sys.newLine,
        useCaseSensitiveFileNames: () => true,
        fileExists,
        readFile,
        resolveModuleNames
    };

    function fileExists(filename: string): boolean {
        return files.some(f => f.name === filename);
    }

    function readFile(filename: string): string | undefined {
        return files.filter(f => f.name === filename).map(f => f.content)[0];
    }

    function getSourceFile(
        fileName: string,
        languageVersion: ts.ScriptTarget,
        onError?: (message: string) => void
    ) {
        const sourceText = readFile(fileName) || ts.sys.readFile(`./node_modules/typescript/lib/${fileName}`);
        return sourceText !== undefined
            ? ts.createSourceFile(fileName, sourceText, languageVersion)
            : undefined;
    }

    function resolveModuleNames(
        moduleNames: string[],
        containingFile: string
    ): ts.ResolvedModule[] {
        const resolvedModules: ts.ResolvedModule[] = [];
        for (const moduleName of moduleNames) {
            // try to use standard resolution
            let result = ts.resolveModuleName(moduleName, containingFile, options, {
                fileExists,
                readFile
            });
            if (result.resolvedModule) {
                resolvedModules.push(result.resolvedModule);
            }
        }
        return resolvedModules;
    }
}

export function getDeclarations(file: TestFile): ir.Declaration[] {
    const options: ts.CompilerOptions = {
    };
    const host = createTestCompilerHost(options, [file]);
    const program = ts.createProgram([file].map(file => file.name), options, host);
    const sourceFile = program.getSourceFile(file.name);
    return iterateDeclarations([sourceFile], ir.irVisitor("args.package", program.getTypeChecker()))
}

export function getSafeIdentifier(identifier: string) : string {
    return identifier.replace(/[^a-zA-Z0-9]/g,"_").replace(/^[^a-zA-Z]/,"_")
}

export function fromSingleToDoubleQuoted(singleQuoted: string) : string {
    return singleQuoted.replace('"','\"').replace(/(\\')/g,'\\"');
}
