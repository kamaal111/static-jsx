import { cursorFor, label, named, ofType } from './helpers.ts';
import type { JSXMatcher } from '../src/cursor.ts';
import { withAncestor, withChild, withDescendant, withParent } from '../src/matchers.ts';
import { parse } from '../src/parser.ts';
import { find } from '../src/search.ts';
import { walk } from '../src/walk.ts';

function matchedNames(source: string, matcher: JSXMatcher): string[] {
  return Array.from(walk(parse(source)))
    .filter(cursor => matcher(cursor))
    .map(label);
}

describe('withParent', () => {
  it('matches a node whose parent matches', () => {
    expect(matchedNames('<ul><li /></ul>', withParent(named('ul')))).toEqual(['li']);
  });

  it('sees through a fragment between a node and its parent', () => {
    expect(matchedNames('<ul><><li /></></ul>', withParent(named('ul')))).toEqual(['fragment', 'li']);
  });

  it('never matches a fragment as a parent, since a fragment is glue rather than structure', () => {
    expect(matchedNames('<ul><><li /></></ul>', withParent(ofType('fragment')))).toEqual([]);
  });

  it('does not match a node under a fragment root, which has no effective parent', () => {
    expect(matchedNames('<><a /></>', withParent(ofType('element')))).toEqual([]);
  });

  it('does not match the root, which has nothing above it', () => {
    expect(
      matchedNames(
        '<a />',
        withParent(() => true),
      ),
    ).toEqual([]);
  });

  it('reads a fragment-wrapped child the way it reads a plain one', () => {
    const wrapped = find(cursorFor('<ul><><li /></></ul>'), withParent(named('ul')));
    const plain = find(cursorFor('<ul><li /></ul>'), withParent(named('ul')));

    expect([wrapped?.node.type, plain?.node.type]).toEqual(['fragment', 'element']);
  });
});

describe('withAncestor', () => {
  it('matches a node with that ancestor anywhere above it', () => {
    expect(matchedNames('<ul><div><li /></div></ul>', withAncestor(named('ul')))).toEqual(['div', 'li']);
  });

  it('still sees a fragment above, which withParent cannot', () => {
    expect(matchedNames('<ul><><li /></></ul>', withAncestor(ofType('fragment')))).toEqual(['li']);
  });

  it('does not match the root', () => {
    expect(
      matchedNames(
        '<a />',
        withAncestor(() => true),
      ),
    ).toEqual([]);
  });
});

describe('withChild', () => {
  it('matches a node with that child directly under it', () => {
    expect(matchedNames('<ul><li /></ul>', withChild(named('li')))).toEqual(['ul']);
  });

  it('sees through a fragment holding the child', () => {
    expect(matchedNames('<ul><><li /></></ul>', withChild(named('li')))).toEqual(['ul', 'fragment']);
  });

  it('never matches a fragment as a child', () => {
    expect(matchedNames('<ul><><li /></></ul>', withChild(ofType('fragment')))).toEqual([]);
  });

  it('does not match a node whose only match is a grandchild', () => {
    expect(matchedNames('<ul><div><li /></div></ul>', withChild(named('li')))).toEqual(['div']);
  });
});

describe('withDescendant', () => {
  it('matches a node with that descendant anywhere below it', () => {
    expect(matchedNames('<ul><div><li /></div></ul>', withDescendant(named('li')))).toEqual(['ul', 'div']);
  });

  it('does not count the node itself as its own descendant', () => {
    expect(matchedNames('<ul><li /></ul>', withDescendant(named('ul')))).toEqual([]);
  });

  it('does not match a leaf', () => {
    expect(
      matchedNames(
        '<ul><li /></ul>',
        withDescendant(() => true),
      ),
    ).toEqual(['ul']);
  });
});
