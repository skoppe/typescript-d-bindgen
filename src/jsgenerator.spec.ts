import { getDeclarations } from './utils';
import * as jsgenerator from './jsgenerator'

function getDecoders(content: string) {
    const declarations = getDeclarations({
        name: 'filename.ts',
        content
    });
    const types = jsgenerator.extractTypesFromDeclarations(declarations);
    return jsgenerator.getDecoders(types.decoders);
}

test('union-string-int', () => {
    expect(getDecoders(`export declare function createChart(container: string | number): void;`))
        .toMatchSnapshot();
});

test('union-string-handle', () => {
    expect(getDecoders(`export declare function createChart(container: string | HTMLElement): void;`))
        .toMatchSnapshot();
});


test('enum-ints', () => {
    expect(getDecoders(`export declare const enum LineType { Simple = 0, WithSteps = 1 }; export declare function createLine(type : LineType): void;`))
        .toBe("");
});

test('enum-ints-no-init', () => {
    expect(getDecoders(`export declare const enum LineType { Simple, WithSteps }; export declare function createLine(type : LineType): void;`))
        .toBe("");
});

test('enum-strings', () => {
    expect(getDecoders(`export declare const enum LineType { s = "Simple", w = "WithSteps" }; export declare function createLine(type : LineType): void;`))
        .toBe("");
});

test('intersection', () => {
    expect(getDecoders(`export declare interface A { name: string }; export declare interface B { age: number }; export declare type Common = A & B; function fun(container: Common): void;`))
        .toBe("");
});

test('optional-string', () => {
    expect(getDecoders(`export declare function createChart(container: string | null): void;`))
        .toMatchSnapshot();
});

test('optional-double', () => {
    expect(getDecoders(`export declare function createChart(container: double | null): void;`))
        .toMatchSnapshot();
});

test('optional-interface', () => {
    expect(getDecoders(`export declare interface A { name: string }; function fun(container: Common | null): void;`))
        .toBe("");
});
// todo: optional templated interface
// todo: optional union
