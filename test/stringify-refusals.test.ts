import { element, expression, fragment, text } from './helpers.ts';
import { JSXStringifyError, StaticJSXError } from '../src/errors.ts';
import { parse } from '../src/parser.ts';
import { stringify } from '../src/stringify.ts';
import type { JSXAttributes, JsonValue } from '../src/types.ts';

describe('a text node parse could never have produced', () => {
  it('refuses an empty one, which would leave nothing behind in the output', () => {
    expect(() => stringify(element('a', {}, [text('')]))).toThrow(JSXStringifyError);
  });

  it('says that parsing would drop it', () => {
    expect(() => stringify(element('a', {}, [text('')]))).toThrow(/drops it/);
  });

  it('refuses two in a row, which would come back as one merged node', () => {
    expect(() => stringify(element('a', {}, [text('x'), text('y')]))).toThrow(JSXStringifyError);
  });

  it('says that parsing would merge them', () => {
    expect(() => stringify(element('a', {}, [text('x'), text('y')]))).toThrow(/merges them/);
  });

  it('refuses them inside a fragment just the same', () => {
    expect(() => stringify(fragment([text('x'), text('y')]))).toThrow(JSXStringifyError);
  });

  it('allows two text nodes separated by an element, which do come back apart', () => {
    const paragraph = element('p', {}, [text('before '), element('b'), text(' after')]);

    expect(parse(stringify(paragraph))).toEqual(paragraph);
  });

  it('allows a text node that is only spaces, which does survive', () => {
    const paragraph = element('p', {}, [text('   ')]);

    expect(parse(stringify(paragraph))).toEqual(paragraph);
  });
});

describe('a name that could not be read back', () => {
  it('refuses an element name that could not be written as a name', () => {
    expect(() => stringify(element('1-2'))).toThrow(JSXStringifyError);
  });

  it('refuses an empty element name', () => {
    expect(() => stringify(element(''))).toThrow(JSXStringifyError);
  });

  it('refuses an element name holding a space, which would read as two names', () => {
    expect(() => stringify(element('a b'))).toThrow(JSXStringifyError);
  });

  it('refuses an element name when the element has children too', () => {
    expect(() => stringify(element('a b', {}, [element('c')]))).toThrow(JSXStringifyError);
  });

  it('refuses an attribute name holding a space', () => {
    expect(() => stringify(element('a', { 'x y': '1' }))).toThrow(JSXStringifyError);
  });

  it('refuses an attribute name that starts with a digit', () => {
    expect(() => stringify(element('a', { 0: '1' }))).toThrow(JSXStringifyError);
  });

  it('allows every character a name may hold', () => {
    const tree = element('x-y.z:_$1', { 'a-b.c:_$2': '1' });

    expect(parse(stringify(tree))).toEqual(tree);
  });
});

describe('a value JSON would not write back', () => {
  it('refuses Infinity in an attribute, which JSON writes as null', () => {
    expect(() => stringify(element('a', { n: Infinity }))).toThrow(JSXStringifyError);
  });

  it('refuses -Infinity', () => {
    expect(() => stringify(element('a', { n: -Infinity }))).toThrow(JSXStringifyError);
  });

  it('refuses NaN', () => {
    expect(() => stringify(element('a', { n: NaN }))).toThrow(JSXStringifyError);
  });

  it('refuses one hidden inside an object in an array', () => {
    expect(() => stringify(element('a', { meta: [{ k: Infinity }] }))).toThrow(JSXStringifyError);
  });

  it('refuses one in an expression child', () => {
    expect(() => stringify(element('a', {}, [expression(Infinity)]))).toThrow(JSXStringifyError);
  });

  it('still prints a real null, which is a value and not a failure', () => {
    expect(stringify(element('a', { missing: null }))).toBe('<a missing={null} />');
  });

  it('still prints a null held inside an array', () => {
    expect(stringify(element('a', { meta: [1, null] }))).toBe('<a meta={[1,null]} />');
  });

  it('still prints an object with more than one key, joined by commas', () => {
    expect(stringify(element('a', { meta: { x: 1, y: 2 } }))).toBe('<a meta={{"x":1,"y":2}} />');
  });

  it('still prints a string, which never holds a number to check', () => {
    expect(stringify(element('a', {}, [expression('null')]))).toBe('<a>\n  {"null"}\n</a>');
  });

  it('refuses a value that is not JSON at all', () => {
    const attributes: JSXAttributes = {};
    Object.defineProperty(attributes, 'n', { value: undefined, enumerable: true });

    expect(() => stringify(element('a', attributes))).toThrow(JSXStringifyError);
  });
});

describe('the indent option', () => {
  it('refuses an indent that would be read back as text', () => {
    expect(() => stringify(element('a', {}, [element('b')]), { indent: '..' })).toThrow(JSXStringifyError);
  });

  it('refuses an indent that would be read back as markup', () => {
    expect(() => stringify(element('a', {}, [element('b')]), { indent: '{' })).toThrow(JSXStringifyError);
  });

  it('refuses it before printing anything, even for a tree with no nesting to indent', () => {
    expect(() => stringify(element('a'), { indent: '..' })).toThrow(JSXStringifyError);
  });

  it('allows an empty indent, which prints the most compact output that still round-trips', () => {
    const tree = element('a', {}, [element('b', {}, [element('c')])]);

    expect(stringify(tree, { indent: '' })).toBe('<a>\n<b>\n<c />\n</b>\n</a>');
    expect(parse(stringify(tree, { indent: '' }))).toEqual(tree);
  });

  it('allows a line break in the indent, because empty lines are dropped on the way back', () => {
    const tree = element('a', {}, [element('b')]);

    expect(parse(stringify(tree, { indent: ' \n ' }))).toEqual(tree);
  });
});

describe('a value JSON itself will not write', () => {
  it('reports a circular value as a stringify error', () => {
    const meta: JsonValue[] = [];
    meta.push(meta);

    expect(() => stringify(element('a', { meta }))).toThrow(JSXStringifyError);
  });
});

describe('nesting with no ceiling of its own', () => {
  const DEPTH = 20000;

  it('prints and reads back 2000 levels of elements', () => {
    const source = `${'<a>'.repeat(2000)}${'</a>'.repeat(2000)}`;
    const tree = parse(source);

    expect(parse(stringify(tree, { indent: '' }))).toEqual(tree);
  });

  it('prints and reads back a deeply nested JSON value', () => {
    const printed = stringify(parse(`<a>{${'['.repeat(DEPTH)}${']'.repeat(DEPTH)}}</a>`));

    expect(stringify(parse(printed))).toBe(printed);
  });

  it('never lets a RangeError escape, however deeply a value is nested', () => {
    const tree = parse(`<a>{${'['.repeat(DEPTH)}${']'.repeat(DEPTH)}}</a>`);

    expect(() => stringify(tree)).not.toThrow(RangeError);
  });
});

describe('every refusal can be caught as one group', () => {
  it('reports a tree that cannot be printed as a StaticJSXError', () => {
    expect(() => stringify(element('1-2'))).toThrow(StaticJSXError);
  });

  it('reports a source that cannot be parsed as a StaticJSXError', () => {
    expect(() => parse('<a>{1e400}</a>')).toThrow(StaticJSXError);
  });
});
