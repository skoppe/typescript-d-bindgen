import * as ts from 'typescript';
import 'source-map-support/register'
import generateDCode from './dgenerator';
import generateJsCode from './jsgenerator';
import { irVisitor } from './ir';
import { iterateDeclarations } from './visitor';
import * as minimist from 'minimist';
import * as process from 'process'
import * as fs from 'fs';

function main(args: minimist.ParsedArgs) {
    if (!args.package) {
        throw new Error("Excepted --package argument denoting typescript package");
    }
    const packagePath = `./node_modules/${args.package}`
    const packageJsonPath = `${packagePath}/package.json`;

    if (!fs.existsSync(`./node_modules/${args.package}`))
        throw new Error("Package ${args.package} is not installed. try: npm install ${args.package}")
    if (!fs.existsSync(packageJsonPath))
        throw new Error("Package ${args.package} contains no package.json")

    let packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString('utf8'));

    const bindingsFile = `${packagePath}/${packageJson.typings}`;
    if (!fs.existsSync(bindingsFile)) {
        throw new Error(`Bindings file ${bindingsFile} of package ${args.package} does not exist`);
    }

    const compilerOptions = {} as ts.CompilerOptions;
    const compilerHost: ts.CompilerHost = ts.createCompilerHost(compilerOptions);
    const program: ts.Program = ts.createProgram([bindingsFile], compilerOptions, compilerHost);
    const sourceFile = program.getSourceFile(bindingsFile);
    const declarations = iterateDeclarations([sourceFile], irVisitor("args.package", program.getTypeChecker()))

    const safePackageName = args.package.replace(/[^a-zA-Z0-9]/g,"_").replace(/^[^a-zA-Z]/,"_")
    const jsTargetDir = './spasm/modules';
    const dTargetDir = './source/spasm/bindings';
    fs.mkdirSync(jsTargetDir, { recursive: true });
    fs.mkdirSync(dTargetDir, { recursive: true });

    fs.writeFileSync(`${jsTargetDir}/${safePackageName}.js`, generateJsCode(declarations, safePackageName));
    fs.writeFileSync(`${dTargetDir}/${safePackageName}.d`, generateDCode(declarations, safePackageName));
}

main(minimist(process.argv.slice(2)));
