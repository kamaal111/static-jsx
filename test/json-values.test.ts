import { asElement } from './helpers.ts';
import { JSXSyntaxError } from '../src/errors.ts';
import { parse } from '../src/parser.ts';
import { stringify } from '../src/stringify.ts';
import type { JSXExpression, JSXNode } from '../src/types.ts';

function asExpression(node: JSXNode | undefined): JSXExpression {
  if (node === undefined || node.type !== 'expression') {
    throw new Error(`Expected an expression, but got a ${node?.type ?? 'missing node'}`);
  }

  return node;
}

describe('a number too large to be written back', () => {
  it('is refused rather than parsed as Infinity and printed as null', () => {
    expect(() => parse('<a>{1e400}</a>')).toThrow(JSXSyntaxError);
  });

  it('says that the value would not survive a round trip', () => {
    expect(() => parse('<a>{1e400}</a>')).toThrow(/would not survive a round trip/);
  });

  it('points at the value rather than the document', () => {
    expect(() => parse('<a>{1e400}</a>')).toThrow(/\(1:4\)/);
  });

  it('is refused when the exponent is written in upper case', () => {
    expect(() => parse('<a>{1E400}</a>')).toThrow(JSXSyntaxError);
  });

  it('is refused when it overflows towards -Infinity', () => {
    expect(() => parse('<a>{-1e400}</a>')).toThrow(JSXSyntaxError);
  });

  it('is refused in an attribute, not only in an expression child', () => {
    expect(() => parse('<a n={1e400} />')).toThrow(JSXSyntaxError);
  });

  it('is refused when it hides inside an array in an object', () => {
    expect(() => parse('<a meta={{"k":[1e999]}} />')).toThrow(JSXSyntaxError);
  });

  it('is refused when it overflows on digits alone, with no exponent', () => {
    expect(() => parse(`<a>{${'9'.repeat(309)}}</a>`)).toThrow(JSXSyntaxError);
  });
});

describe('a number that is merely rounded', () => {
  const LONG_INTEGER = '12345678901234567890';

  it('is kept, because the rounded value is what writes back', () => {
    expect(asExpression(parse(`<a>{${LONG_INTEGER}}</a>`).children[0]).value).toBe(Number(LONG_INTEGER));
  });

  it('prints and reads back the rounded value unchanged from then on', () => {
    const printed = stringify(parse(`<a>{${LONG_INTEGER}}</a>`));

    expect(stringify(parse(printed))).toBe(printed);
  });

  it('is kept at the largest number a double can hold', () => {
    expect(asExpression(parse('<a>{1.7976931348623157e308}</a>').children[0]).value).toBe(1.7976931348623157e308);
  });

  it('is kept at the smallest number a double can hold', () => {
    expect(asExpression(parse('<a>{5e-324}</a>').children[0]).value).toBe(5e-324);
  });

  it('is kept when it has an exponent that does not overflow', () => {
    expect(asExpression(parse('<a>{1e5}</a>').children[0]).value).toBe(100000);
  });

  it('is kept when it is long enough to be checked but still fits', () => {
    expect(asExpression(parse(`<a>{${'1'.repeat(309)}}</a>`).children[0]).value).toBe(Number(`${'1'.repeat(309)}`));
  });

  it('is kept at 308 digits, one short of where a literal could overflow', () => {
    expect(asExpression(parse(`<a>{${'9'.repeat(308)}}</a>`).children[0]).value).toBe(Number(`${'9'.repeat(308)}`));
  });
});

describe('negative zero', () => {
  it('is refused in an expression, because JSON writes it back as a positive zero', () => {
    expect(() => parse('<a>{-0}</a>')).toThrow(JSXSyntaxError);
  });

  it('says that the value would not survive a round trip', () => {
    expect(() => parse('<a>{-0}</a>')).toThrow(/would not survive a round trip/);
  });

  it('is refused in an attribute', () => {
    expect(() => parse('<a n={-0} />')).toThrow(JSXSyntaxError);
  });

  it('is refused inside an array', () => {
    expect(() => parse('<a meta={[-0]} />')).toThrow(JSXSyntaxError);
  });

  it('is refused inside an object nested in an array', () => {
    expect(() => parse('<a meta={[{"k":-0}]} />')).toThrow(JSXSyntaxError);
  });

  it('leaves every other negative number alone', () => {
    expect(asExpression(parse('<a>{-1.5}</a>').children[0]).value).toBe(-1.5);
  });

  it('leaves a negative number that merely starts with a zero alone', () => {
    expect(asExpression(parse('<a>{-0.5}</a>').children[0]).value).toBe(-0.5);
  });

  it('is refused when a number underflows to it rather than being written as it', () => {
    expect(() => parse('<a>{-1e-400}</a>')).toThrow(JSXSyntaxError);
  });
});

describe('a value whose only `e` spells a boolean', () => {
  it('keeps the booleans it is made of', () => {
    expect(asElement(parse('<a meta={{"on":true,"off":false}} />')).attributes.meta).toEqual({ on: true, off: false });
  });

  it('still refuses an overflowing number standing next to them', () => {
    expect(() => parse('<a meta={{"on":true,"n":1e400}} />')).toThrow(/would not survive a round trip/);
  });

  it('still refuses a negative zero standing next to them', () => {
    expect(() => parse('<a meta={{"on":true,"n":-0}} />')).toThrow(JSXSyntaxError);
  });

  it('still refuses a number that underflows to negative zero with no `-0` in its text', () => {
    expect(() => parse('<a>{[true,-1e-400]}</a>')).toThrow(JSXSyntaxError);
  });

  it('keeps a quoted number whose exponent would have overflowed outside the quotes', () => {
    expect(asElement(parse('<a t={"1e400"} />')).attributes.t).toBe('1e400');
  });
});

describe('a JSON value nested far deeper than a recursive walk could follow', () => {
  const DEPTH = 20000;

  it('parses whether or not the value asked to be checked', () => {
    const plain = `<a>{${'['.repeat(DEPTH)}${']'.repeat(DEPTH)}}</a>`;
    const checked = `<a>{${'['.repeat(DEPTH)}1e5${']'.repeat(DEPTH)}}</a>`;

    expect(() => parse(plain)).not.toThrow();
    expect(() => parse(checked)).not.toThrow();
  });

  it('still reports an unwritable number found at the bottom of it', () => {
    const source = `<a>{${'['.repeat(DEPTH)}1e400${']'.repeat(DEPTH)}}</a>`;

    expect(() => parse(source)).toThrow(/would not survive a round trip/);
  });
});

describe('what the parser already normalized', () => {
  it.each([
    ['an exponent in upper case', '<a>{1E2}</a>', '<a>\n  {100}\n</a>'],
    ['a trailing zero', '<a>{1.50}</a>', '<a>\n  {1.5}\n</a>'],
    ['a string written in braces', '<a t={"hi"} />', '<a t="hi" />'],
    ['a boolean written in braces', '<a t={true} />', '<a t />'],
  ])('settles %s on the first print', (_label, source, printed) => {
    expect(stringify(parse(source))).toBe(printed);
    expect(stringify(parse(printed))).toBe(printed);
  });
});
