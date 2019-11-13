import * as ts from 'typescript';
import 'source-map-support/register'
import createDBindingsGenerator from './dbindings';
import generateDWrapperCode from './dwrappers';
import createJsGlueGenerator from './jsglue';
import { irVisitor, Declaration } from './ir';
import { walkDeclarations, logVisitor } from './visitor';

const compilerOptions = {} as ts.CompilerOptions;
const compilerHost: ts.CompilerHost = ts.createCompilerHost(compilerOptions);

const program: ts.Program = ts.createProgram(["node_modules/lightweight-charts/dist/typings.d.ts"], compilerOptions, compilerHost);

const typeChecker = program.getTypeChecker();

const getSymbol = (declaration: ts.Declaration) => {
    let symbol: ts.Symbol | undefined = (declaration as any).symbol;
    return symbol;
}

const sourceFile = program.getSourceFile("node_modules/lightweight-charts/dist/typings.d.ts");

const moduleSymbol: ts.Symbol | undefined = getSymbol(sourceFile);

// console.log(JSON.stringify(createIR("tradingview").generate(moduleSymbol.exports), null, 4));
program.getTypeChecker().getAliasedSymbol

const declarations: Declaration[] = walkDeclarations(moduleSymbol.declarations, irVisitor("tradingview", program.getTypeChecker()))

console.log(generateDWrapperCode(declarations));
