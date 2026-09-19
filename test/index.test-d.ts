import { expectTypeOf } from 'vitest';

import { parse, stringify, type JSXNode, type JSXRootNode, type StringifyOptions } from '../src/index.ts';

describe('parse', () => {
  it('returns an element or a fragment, never a text or expression node', () => {
    expectTypeOf(parse('<a />')).toEqualTypeOf<JSXRootNode>();
  });
});

describe('stringify', () => {
  it('accepts any node, not only one that can be a root', () => {
    expectTypeOf(stringify).parameter(0).toEqualTypeOf<JSXNode>();
  });

  it('takes its options as an optional second argument', () => {
    expectTypeOf(stringify).parameter(1).toEqualTypeOf<StringifyOptions | undefined>();
  });

  it('returns a string', () => {
    expectTypeOf(stringify).returns.toEqualTypeOf<string>();
  });
});
