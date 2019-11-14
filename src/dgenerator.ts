import generateDWrapperCode from './dwrappers';
import generateDBindingCode from './dbindings';
import * as ir from './ir'

export default function generateDCode(declarations: ir.Declaration[], packageName: string) : string {
    const wrappers = generateDWrapperCode(declarations, packageName);
    const bindings = generateDBindingCode(declarations, packageName);

    const header =
        `module spasm.bindings.${packageName};\n\n` +
        `import spasm.types;\n` +
        `import spasm.bindings.common;\n` +
        `import spasm.bindings.typescript_interop;\n\n` +
        `@safe:\n` +
        `nothrow:\n`;

    return [header, wrappers, bindings].join("\n");
}
