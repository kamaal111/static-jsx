import fc from 'fast-check';

import { element, expression, fragment, text } from './helpers.ts';
import type { JSXAttributes, JSXNode, JSXRootNode, JsonValue } from '../src/types.ts';

const FIXED_SEED = 0x2f6e2b1;

const DEFAULT_RUNS = 200;

const NAME_START_CHARACTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$'.split('');

const NAME_PART_CHARACTERS = [...NAME_START_CHARACTERS, ...'0123456789-.:'.split('')];

const DANGEROUS_NAMES = ['__proto__', 'constructor', 'prototype', 'toString'];

const INVALID_NAMES = ['', '1a', 'a b', '<a', 'a/', 'a"', 'a>', ' a', 'a\n', '-a', '.a'];

const TEXT_PIECES = [
  'a',
  ' ',
  '  ',
  '\t',
  '\n',
  '\r',
  '\r\n',
  '&',
  '&amp;',
  '&#38;',
  '&#x26;',
  '&nbsp;',
  '&#55296;',
  'trailing &',
  'semi;colon',
  '<',
  '>',
  '{',
  '}',
  '"',
  "'",
  '\u{1f600}',
  '\ud800',
  '\udc00',
];

const INDENT_CHARACTERS = [' ', '\t', '\n', '\r'];

function readRuns(): number {
  const configured = Number(process.env.FUZZ_RUNS);

  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_RUNS;
}

function readSeed(): number | undefined {
  return process.env.FUZZ_SEED === 'random' ? undefined : FIXED_SEED;
}

function propertyOptions(): fc.Parameters<unknown> {
  const numRuns = readRuns();
  const seed = readSeed();

  return seed === undefined ? { numRuns } : { numRuns, seed };
}

export const PROPERTY_OPTIONS = propertyOptions();

export const arbBinaryString = fc.string({ unit: 'binary' });

export const arbName: fc.Arbitrary<string> = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(...NAME_START_CHARACTERS) },
  { weight: 1, arbitrary: fc.constantFrom(...DANGEROUS_NAMES) },
  {
    weight: 8,
    arbitrary: fc
      .tuple(
        fc.constantFrom(...NAME_START_CHARACTERS),
        fc.array(fc.constantFrom(...NAME_PART_CHARACTERS), { maxLength: 8 }),
      )
      .map(([start, parts]) => start + parts.join('')),
  },
);

export const arbInvalidName: fc.Arbitrary<string> = fc.constantFrom(...INVALID_NAMES);

export const arbWritableNumber = fc
  .double({ noNaN: true, noDefaultInfinity: true })
  .filter(value => !Object.is(value, -0));

const arbUnwritableNumber = fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0);

function jsonValueArbitrary(arbNumber: fc.Arbitrary<number>): fc.Arbitrary<JsonValue> {
  const { value } = fc.letrec<{ value: JsonValue; leaf: JsonValue }>(tie => ({
    leaf: fc.oneof(arbBinaryString, arbNumber, fc.boolean(), fc.constant(null)),
    value: fc.oneof(
      { maxDepth: 3 },
      tie('leaf'),
      fc.array(tie('value'), { maxLength: 3 }),
      fc.dictionary(fc.string({ unit: 'binary', maxLength: 6 }), tie('value'), { maxKeys: 3, noNullPrototype: true }),
    ),
  }));

  return value;
}

const arbWritableJsonValue = jsonValueArbitrary(arbWritableNumber);

const arbAnyJsonValue = jsonValueArbitrary(fc.oneof(arbWritableNumber, arbUnwritableNumber));

function piecedString(minLength: number): fc.Arbitrary<string> {
  return fc.array(fc.constantFrom(...TEXT_PIECES), { minLength, maxLength: 6 }).map(pieces => pieces.join(''));
}

export const arbTextLike: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: piecedString(0) },
  { weight: 1, arbitrary: arbBinaryString },
);

const arbText: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: piecedString(1) },
  { weight: 1, arbitrary: fc.string({ unit: 'binary', minLength: 1 }) },
);

export const arbIndent = fc.string({ unit: fc.constantFrom(...INDENT_CHARACTERS), maxLength: 4 });

export const arbInvalidIndent = fc.constantFrom('..', '{', 'x', ' a ', '<', '&');

function attributesArbitrary(
  arbKey: fc.Arbitrary<string>,
  arbValue: fc.Arbitrary<JsonValue>,
): fc.Arbitrary<JSXAttributes> {
  return fc
    .array(
      fc.tuple(arbKey, fc.oneof({ weight: 1, arbitrary: fc.constant(true) }, { weight: 3, arbitrary: arbValue })),
      {
        maxLength: 3,
      },
    )
    .map(entries => {
      const attributes: JSXAttributes = {};

      for (const [name, value] of entries) {
        Object.defineProperty(attributes, name, { value, writable: true, enumerable: true, configurable: true });
      }

      return attributes;
    });
}

function legalChildren(children: readonly JSXNode[]): JSXNode[] {
  const kept: JSXNode[] = [];

  for (const child of children) {
    if (child.type !== 'text') {
      kept.push(child);
      continue;
    }

    if (child.value.length > 0 && kept.at(-1)?.type !== 'text') {
      kept.push(child);
    }
  }

  return kept;
}

interface TreeArbitraries {
  readonly arbNodeName: fc.Arbitrary<string>;
  readonly arbAttributeName: fc.Arbitrary<string>;
  readonly arbValue: fc.Arbitrary<JsonValue>;
  readonly arbTextValue: fc.Arbitrary<string>;
  readonly makeChildren: (children: readonly JSXNode[]) => JSXNode[];
}

function treeArbitrary(parts: TreeArbitraries): fc.Arbitrary<JSXRootNode> {
  const { value: node } = fc.letrec<{ value: JSXRootNode; child: JSXNode }>(tie => ({
    child: fc.oneof(
      { maxDepth: 3, depthIdentifier: 'child' },
      parts.arbTextValue.map(text),
      parts.arbValue.map(expression),
      tie('value'),
    ),
    value: fc
      .tuple(
        fc.boolean(),
        parts.arbNodeName,
        attributesArbitrary(parts.arbAttributeName, parts.arbValue),
        fc.array(tie('child'), { maxLength: 4 }).map(parts.makeChildren),
      )
      .map(([isFragment, name, attributes, children]) =>
        isFragment ? fragment(children) : element(name, attributes, children),
      ),
  }));

  return node;
}

export const arbTree = treeArbitrary({
  arbNodeName: arbName,
  arbAttributeName: arbName,
  arbValue: arbWritableJsonValue,
  arbTextValue: arbText,
  makeChildren: legalChildren,
});

export const arbAnyTree = treeArbitrary({
  arbNodeName: fc.oneof({ weight: 3, arbitrary: arbName }, { weight: 1, arbitrary: arbInvalidName }),
  arbAttributeName: fc.oneof({ weight: 3, arbitrary: arbName }, { weight: 1, arbitrary: arbInvalidName }),
  arbValue: arbAnyJsonValue,
  arbTextValue: fc.oneof({ weight: 3, arbitrary: arbText }, { weight: 1, arbitrary: fc.constant('') }),
  makeChildren: children => [...children],
});
