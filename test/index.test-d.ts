import { expectTypeOf } from 'vitest';

import { parse, stringify, type JSXRootNode, type ParseOptions, type StringifyOptions } from '../src/index.ts';

describe('parse', () => {
  it('returns an element or a fragment, never a text or expression node', () => {
    expectTypeOf(parse('<a />')).toEqualTypeOf<JSXRootNode>();
  });

  it('takes its options as an optional second argument', () => {
    expectTypeOf(parse).parameter(1).toEqualTypeOf<ParseOptions | undefined>();
  });
});

describe('stringify', () => {
  it('accepts only a node that can be a root, so its output is always something parse can read', () => {
    expectTypeOf(stringify).parameter(0).toEqualTypeOf<JSXRootNode>();
  });

  it('takes its options as an optional second argument', () => {
    expectTypeOf(stringify).parameter(1).toEqualTypeOf<StringifyOptions | undefined>();
  });

  it('returns a string', () => {
    expectTypeOf(stringify).returns.toEqualTypeOf<string>();
  });
});
