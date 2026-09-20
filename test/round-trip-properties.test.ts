import fc from 'fast-check';

import { PROPERTY_OPTIONS, arbIndent, arbTree } from './arbitraries.ts';
import { parse } from '../src/parser.ts';
import { stringify } from '../src/stringify.ts';

describe('any tree a printer can write', () => {
  it('parses back to an equal tree', () => {
    fc.assert(
      fc.property(arbTree, arbIndent, (tree, indent) => {
        expect(parse(stringify(tree, { indent }))).toEqual(tree);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it('prints to the same string when its parsed form is printed again', () => {
    fc.assert(
      fc.property(arbTree, arbIndent, (tree, indent) => {
        const printed = stringify(tree, { indent });

        expect(stringify(parse(printed), { indent })).toBe(printed);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it('is unchanged by a trip through JSON', () => {
    fc.assert(
      fc.property(arbTree, tree => {
        expect(JSON.parse(JSON.stringify(tree))).toEqual(tree);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it('prints something well-formed, so any UTF-8 file can hold it', () => {
    fc.assert(
      fc.property(arbTree, arbIndent, (tree, indent) => {
        expect(stringify(tree, { indent }).isWellFormed()).toBe(true);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it('reads back as the same tree whichever indent it was printed with', () => {
    fc.assert(
      fc.property(arbTree, arbIndent, arbIndent, (tree, first, second) => {
        expect(parse(stringify(tree, { indent: first }))).toEqual(parse(stringify(tree, { indent: second })));
      }),
      PROPERTY_OPTIONS,
    );
  });
});
