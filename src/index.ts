import * as ts from 'typescript';
import 'source-map-support/register'
import generateDWrapperCode from './dwrappers';
import { irVisitor } from './ir';
import { iterateDeclarations } from './visitor';
import * as minimist from 'minimist';
import * as process from 'process'
import * as fs from 'fs';

function main(args: minimist.ParsedArgs) {
    if (!args.file) {
        throw new Error("Excepted --file argument denoting input typescript file");
    }
    if (!fs.existsSync(args.file)) {
        throw new Error(`File ${args.file} does not exist`);
    }

    const inputFile = args.file;
    const compilerOptions = {} as ts.CompilerOptions;
    const compilerHost: ts.CompilerHost = ts.createCompilerHost(compilerOptions);
    const program: ts.Program = ts.createProgram([inputFile], compilerOptions, compilerHost);
    const sourceFile = program.getSourceFile(inputFile);
    const declarations = iterateDeclarations([sourceFile], irVisitor("tradingview", program.getTypeChecker()))

    console.log(generateDWrapperCode(declarations));
}

main(minimist(process.argv.slice(2)));
