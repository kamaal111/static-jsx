import { cursorFor, named, pathTo, withAttribute } from './helpers.ts';
import { childrenOf, type JSXCursor } from '../src/cursor.ts';
import { parse } from '../src/parser.ts';
import { closest, find, findAll } from '../src/search.ts';

describe('find', () => {
  it('gives the first match in document order', () => {
    expect(pathTo(find(parse('<row><a /><b /><a /></row>'), named('a')) ?? cursorFor('<x />'))).toEqual([0]);
  });

  it('gives nothing when no node matches', () => {
    expect(find(parse('<row><a /></row>'), named('z'))).toBeUndefined();
  });

  it('can match the node it starts from', () => {
    expect(find(parse('<a />'), named('a'))?.node.name).toBe('a');
  });

  it('searches only the subtree when it starts from a cursor', () => {
    const second = childrenOf(cursorFor('<row><a><z /></a><b><z /></b></row>'))[1];

    expect(second === undefined ? undefined : pathTo(find(second, named('z')) ?? second)).toEqual([1, 0]);
  });

  it('stops walking as soon as it has a match', () => {
    let asked = 0;

    find(parse('<row><a /><b /><c /></row>'), cursor => {
      asked += 1;

      return cursor.node.type === 'element' && cursor.node.name === 'a';
    });

    expect(asked).toBe(2);
  });
});

describe('findAll', () => {
  it('gives every match in document order', () => {
    expect(Array.from(findAll(parse('<row><a /><b /><a /></row>'), named('a')), pathTo)).toEqual([[0], [2]]);
  });

  it('gives nothing when no node matches', () => {
    expect(Array.from(findAll(parse('<row><a /></row>'), named('z')))).toEqual([]);
  });

  it('is lazy enough to hand over a match before walking the rest', () => {
    const matches = findAll(parse('<row><a /><a /></row>'), named('a'));

    expect(pathTo(matches.next().value ?? cursorFor('<x />'))).toEqual([0]);
  });
});

describe('closest', () => {
  it('gives the cursor itself when it matches', () => {
    const cursor = childrenOf(cursorFor('<ul><li /></ul>'))[0];

    expect(cursor === undefined ? undefined : closest(cursor, named('li'))?.node.name).toBe('li');
  });

  it('climbs to the nearest matching ancestor', () => {
    const inner = childrenOf(childrenOf(cursorFor('<ul><div><li /></div></ul>'))[0] ?? cursorFor('<x />'))[0];

    expect(inner === undefined ? undefined : closest(inner, named('ul'))?.node.name).toBe('ul');
  });

  it('prefers the nearest of two matching ancestors', () => {
    const inner = childrenOf(childrenOf(cursorFor('<a><a><li /></a></a>'))[0] ?? cursorFor('<x />'))[0];

    expect(inner === undefined ? undefined : pathTo(closest(inner, named('a')) ?? inner)).toEqual([0]);
  });

  it('gives nothing when neither the cursor nor anything above it matches', () => {
    const cursor = childrenOf(cursorFor('<ul><li /></ul>'))[0];

    expect(cursor === undefined ? undefined : closest(cursor, named('zz'))).toBeUndefined();
  });

  it('matches an ancestor by more than its name', () => {
    const cursor = childrenOf(cursorFor('<ul open><li /></ul>'))[0];
    const matcher = (step: JSXCursor): boolean => named('ul')(step) && withAttribute('open')(step);

    expect(cursor === undefined ? undefined : closest(cursor, matcher)?.node.type).toBe('element');
  });
});
