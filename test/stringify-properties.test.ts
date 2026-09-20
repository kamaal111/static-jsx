import { isDeepStrictEqual } from 'node:util';

import fc from 'fast-check';

import { PROPERTY_OPTIONS, arbAnyTree, arbInvalidIndent, arbTree } from './arbitraries.ts';
import { JSXStringifyError } from '../src/errors.ts';
import { parse } from '../src/parser.ts';
import { stringify } from '../src/stringify.ts';
import type { JSXRootNode } from '../src/types.ts';

const REFUSED = 'refused';

const ROUND_TRIPPED = 'printed a tree that reads back equal';

const PRINTED = 'printed';

const REFUSAL = 'refused with a JSXStringifyError';

function stringifyVerdict(tree: JSXRootNode): string {
  let printed: string;

  try {
    printed = stringify(tree);
  } catch (error) {
    return error instanceof JSXStringifyError ? REFUSED : `threw a different error: ${String(error)}`;
  }

  try {
    return isDeepStrictEqual(parse(printed), tree) ? ROUND_TRIPPED : 'printed a tree that reads back differently';
  } catch {
    return 'printed something that does not parse';
  }
}

function refusalVerdict(tree: JSXRootNode): string {
  try {
    stringify(tree);

    return PRINTED;
  } catch (error) {
    return error instanceof JSXStringifyError ? REFUSAL : `a different error: ${String(error)}`;
  }
}

function indentVerdict(tree: JSXRootNode, indent: string): string {
  try {
    stringify(tree, { indent });

    return PRINTED;
  } catch (error) {
    return error instanceof JSXStringifyError ? REFUSAL : `a different error: ${String(error)}`;
  }
}

describe('any tree at all, legal or not', () => {
  it('is either refused or printed as something that reads back equal', () => {
    fc.assert(
      fc.property(arbAnyTree, tree => {
        expect(stringifyVerdict(tree), `tree: ${JSON.stringify(tree)}`).toBeOneOf([REFUSED, ROUND_TRIPPED]);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it('is refused with a JSXStringifyError rather than any other error', () => {
    fc.assert(
      fc.property(arbAnyTree, tree => {
        expect(refusalVerdict(tree), `tree: ${JSON.stringify(tree)}`).toBeOneOf([PRINTED, REFUSAL]);
      }),
      PROPERTY_OPTIONS,
    );
  });
});

describe('an indent holding anything but layout', () => {
  it('is refused for any tree, however simple', () => {
    fc.assert(
      fc.property(arbTree, arbInvalidIndent, (tree, indent) => {
        expect(indentVerdict(tree, indent), `indent: ${JSON.stringify(indent)}`).toBe(REFUSAL);
      }),
      PROPERTY_OPTIONS,
    );
  });
});
