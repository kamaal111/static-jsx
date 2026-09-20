import { isDeepStrictEqual } from 'node:util';

import fc from 'fast-check';

import { PROPERTY_OPTIONS, arbBinaryString, arbTree } from './arbitraries.ts';
import { syntaxErrorOrUndefined } from './helpers.ts';
import { JSXSyntaxError } from '../src/errors.ts';
import { parse } from '../src/parser.ts';
import { stringify } from '../src/stringify.ts';

const MUTATION_CHARACTERS = ['<>{}"/&;= \n\t\\'.split(''), ['\ud800']].flat();

const PARSED = 'a tree';

const REJECTED = 'a syntax error';

const SOUND_PARSE_VERDICTS = [PARSED, REJECTED];

const NOT_REJECTED = 'the source parsed';

const arbTruncatedSource = arbTree.chain(tree => {
  const printed = stringify(tree);

  return fc.integer({ min: 0, max: printed.length }).map(length => printed.slice(0, length));
});

const arbMutatedSource = arbTree.chain(tree => {
  const printed = stringify(tree);

  return fc
    .tuple(
      fc.integer({ min: 0, max: Math.max(printed.length - 1, 0) }),
      fc.constantFrom('delete', 'duplicate', 'swap', 'replace'),
      fc.constantFrom(...MUTATION_CHARACTERS),
    )
    .map(([index, operation, replacement]) => mutate(printed, index, operation, replacement));
});

const arbSource = fc.oneof(arbBinaryString, arbTruncatedSource, arbMutatedSource);

function mutate(source: string, index: number, operation: string, replacement: string): string {
  const head = source.slice(0, index);
  const character = source.slice(index, index + 1);
  const tail = source.slice(index + 1);

  switch (operation) {
    case 'delete':
      return head + tail;
    case 'duplicate':
      return head + character + character + tail;
    case 'swap':
      return head + tail.slice(0, 1) + character + tail.slice(1);
    default:
      return head + replacement + tail;
  }
}

function parseVerdict(source: string): string {
  try {
    parse(source);

    return PARSED;
  } catch (error) {
    return error instanceof JSXSyntaxError ? REJECTED : `a different error: ${String(error)}`;
  }
}

function offsetVerdict(source: string): string {
  const error = syntaxErrorOrUndefined(source);

  if (error === undefined) {
    return NOT_REJECTED;
  }

  const inside = error.offset >= 0 && error.offset <= source.length;

  return inside ? 'inside the source' : `at ${error.offset}, outside a source of ${source.length}`;
}

function positionVerdict(source: string): string {
  const error = syntaxErrorOrUndefined(source);

  if (error === undefined) {
    return NOT_REJECTED;
  }

  return error.line >= 1 && error.column >= 1 ? 'one-based' : `line ${error.line}, column ${error.column}`;
}

function frameVerdict(source: string): string {
  const error = syntaxErrorOrUndefined(source);

  if (error === undefined) {
    return NOT_REJECTED;
  }

  const lines = error.frame.split('\n');
  const [sourceLine, caretLine] = lines;

  if (lines.length !== 2) {
    return `${lines.length} lines`;
  }

  const gutterWidth = (sourceLine?.indexOf('| ') ?? 0) + 2;
  const caret = caretLine?.indexOf('^') ?? -1;

  return caret === gutterWidth + error.column - 1 ? 'under the reported column' : `at ${caret}, not the column`;
}

function printBackVerdict(source: string): string {
  let tree;

  try {
    tree = parse(source);
  } catch {
    return 'not a document';
  }

  let printed: string;

  try {
    printed = stringify(tree);
  } catch (error) {
    return `refused: ${String(error)}`;
  }

  return isDeepStrictEqual(parse(printed), tree) ? 'read back equal' : 'read back different';
}

describe('parse is total', () => {
  it('answers arbitrary text with a tree or a syntax error, never anything else', () => {
    fc.assert(
      fc.property(arbBinaryString, source => {
        expect(parseVerdict(source), `source: ${JSON.stringify(source)}`).toBeOneOf(SOUND_PARSE_VERDICTS);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it('answers a document cut short with a tree or a syntax error', () => {
    fc.assert(
      fc.property(arbTruncatedSource, source => {
        expect(parseVerdict(source), `source: ${JSON.stringify(source)}`).toBeOneOf(SOUND_PARSE_VERDICTS);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it('answers a document with one character changed with a tree or a syntax error', () => {
    fc.assert(
      fc.property(arbMutatedSource, source => {
        expect(parseVerdict(source), `source: ${JSON.stringify(source)}`).toBeOneOf(SOUND_PARSE_VERDICTS);
      }),
      PROPERTY_OPTIONS,
    );
  });
});

describe('a syntax error from any source', () => {
  it('points somewhere inside the source it was given', () => {
    fc.assert(
      fc.property(arbSource, source => {
        expect(offsetVerdict(source), `source: ${JSON.stringify(source)}`).toBeOneOf([
          NOT_REJECTED,
          'inside the source',
        ]);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it('reports a line and column a reader can count to', () => {
    fc.assert(
      fc.property(arbSource, source => {
        expect(positionVerdict(source), `source: ${JSON.stringify(source)}`).toBeOneOf([NOT_REJECTED, 'one-based']);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it('draws a frame of exactly two lines with the caret under the reported column', () => {
    fc.assert(
      fc.property(arbSource, source => {
        expect(frameVerdict(source), `source: ${JSON.stringify(source)}`).toBeOneOf([
          NOT_REJECTED,
          'under the reported column',
        ]);
      }),
      PROPERTY_OPTIONS,
    );
  });
});

describe('whatever parse accepts', () => {
  it('prints back and reads as the same tree, so no accepted document is unprintable', () => {
    fc.assert(
      fc.property(arbSource, source => {
        expect(printBackVerdict(source), `source: ${JSON.stringify(source)}`).toBeOneOf([
          'not a document',
          'read back equal',
        ]);
      }),
      PROPERTY_OPTIONS,
    );
  });
});
