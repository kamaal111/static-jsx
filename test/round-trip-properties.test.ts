import { parse } from '../src/parser.ts';
import { stringify } from '../src/stringify.ts';
import type { JSXAttributes, JSXNode, JSXRootNode, JsonValue } from '../src/types.ts';

const TREES = 5000;

const MAX_DEPTH = 3;

const SEED = 0x2f6e2b1;

const NAMES = ['a', 'card', 'x-y', 'a.b', 'ns:tag', '_u', '$d', 'H1'];

const TEXTS = [
  'hello',
  ' leading',
  'trailing ',
  ' both ',
  '  ',
  'a & b',
  'a < b > c',
  '{braces}',
  'line\nbreak',
  '\ttab',
  'blank\n\nline',
  '&nbsp;',
  '&amp;',
  '&#38;',
  'trailing &',
  'semi;colon',
  'nbsp here',
  'emoji \u{1f600} here',
  'lone \ud800 surrogate',
  'quote " and \' here',
  'carriage\r\nreturn',
];

const VALUES: readonly JsonValue[] = [
  'str',
  '',
  ' ',
  'with "quotes"',
  'with <tag>',
  'with &amp;',
  'new\nline',
  '\ttab',
  '}brace{',
  'emoji \u{1f600}',
  'lone \ud800 surrogate',
  0,
  1,
  -1,
  1.5,
  -2.25,
  1e21,
  5e-324,
  1.7976931348623157e308,
  Number.MAX_SAFE_INTEGER,
  true,
  false,
  null,
  [],
  [1, 'two', null],
  {},
  { k: 1 },
  { nested: { deep: [true, 'x'] } },
];

function makeRandom(seed: number): () => number {
  let state = seed;

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;

    return state / 0x100000000;
  };
}

function makeTree(random: () => number): JSXRootNode {
  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(random() * items.length)];

    if (item === undefined) {
      throw new Error('a pool to pick from must not be empty');
    }

    return item;
  };

  const makeAttributes = (): JSXAttributes => {
    const attributes: JSXAttributes = {};

    for (let index = 0; index < Math.floor(random() * 4); index += 1) {
      attributes[pick(NAMES)] = random() < 0.25 ? true : pick(VALUES);
    }

    return attributes;
  };

  const makeChildren = (depth: number): JSXNode[] => {
    const children: JSXNode[] = [];

    for (let index = 0; index < Math.floor(random() * 4); index += 1) {
      const kind = random();

      if (kind < 0.35 && depth > 0) {
        children.push(makeNode(depth - 1));
      } else if (kind < 0.7) {
        if (children.at(-1)?.type !== 'text') {
          children.push({ type: 'text', value: pick(TEXTS) });
        }
      } else {
        children.push({ type: 'expression', value: pick(VALUES) });
      }
    }

    return children;
  };

  function makeNode(depth: number): JSXRootNode {
    const children = depth > 0 ? makeChildren(depth) : [];

    return random() < 0.2
      ? { type: 'fragment', children }
      : { type: 'element', name: pick(NAMES), attributes: makeAttributes(), children };
  }

  return makeNode(MAX_DEPTH);
}

describe(`${TREES} generated trees`, () => {
  const random = makeRandom(SEED);
  const trees = Array.from({ length: TREES }, () => makeTree(random));

  it.each(trees)('parse(stringify(tree)) deep-equals tree', tree => {
    expect(parse(stringify(tree)), `tree: ${JSON.stringify(tree)}`).toEqual(tree);
  });

  it.each(trees)('stringify(parse(printed)) exactly equals printed', tree => {
    const printed = stringify(tree);

    expect(stringify(parse(printed)), `printed: ${JSON.stringify(printed)}`).toBe(printed);
  });

  it.each(trees)('JSON.parse(JSON.stringify(tree)) equals tree', tree => {
    expect(JSON.parse(JSON.stringify(tree)), `tree: ${JSON.stringify(tree)}`).toEqual(tree);
  });

  it.each(trees)('prints something that is always well-formed UTF-16, so any file can hold it', tree => {
    const printed = stringify(tree);

    expect(printed.isWellFormed(), `printed: ${JSON.stringify(printed)}`).toBe(true);
  });
});
