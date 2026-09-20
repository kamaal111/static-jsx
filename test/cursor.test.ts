import { cursorFor, pathTo, text } from './helpers.ts';
import {
  ancestorsOf,
  childrenOf,
  effectiveChildrenOf,
  effectiveParentOf,
  isElementCursor,
  isFragmentCursor,
  isParentNode,
  type JSXCursor,
} from '../src/cursor.ts';
import { parse } from '../src/parser.ts';

function childAt(source: string, ...indices: readonly number[]): JSXCursor {
  let cursor: JSXCursor = cursorFor(source);

  for (const index of indices) {
    const child = childrenOf(cursor)[index];

    expect(child).toBeDefined();
    cursor = child ?? cursor;
  }

  return cursor;
}

describe('rootCursor', () => {
  it('starts at depth zero', () => {
    expect(cursorFor('<a />').depth).toBe(0);
  });

  it('has nothing above it', () => {
    expect(cursorFor('<a />').parent).toBeUndefined();
  });

  it('reports the root index as minus one', () => {
    expect(cursorFor('<a />').index).toBe(-1);
  });
});

describe('childrenOf', () => {
  it('gives one cursor per child, in order', () => {
    const names = childrenOf(cursorFor('<row><a /><b /></row>')).map(child => child.node);

    expect(names).toEqual([parse('<a />'), parse('<b />')]);
  });

  it('numbers each child by its position', () => {
    expect(childrenOf(cursorFor('<row><a /><b /></row>')).map(child => child.index)).toEqual([0, 1]);
  });

  it('puts each child one level deeper than its parent', () => {
    expect(childrenOf(cursorFor('<row><a /></row>')).map(child => child.depth)).toEqual([1]);
  });

  it('gives no children for a text node', () => {
    expect(childrenOf(childAt('<p>hi</p>', 0))).toEqual([]);
  });

  it('gives no children for an element written without any', () => {
    expect(childrenOf(cursorFor('<a />'))).toEqual([]);
  });
});

describe('pathTo', () => {
  it('addresses the root as the empty path', () => {
    expect(pathTo(cursorFor('<a />'))).toEqual([]);
  });

  it('addresses a nested node by the child indices leading to it', () => {
    expect(pathTo(childAt('<row><a /><b><c /></b></row>', 1, 0))).toEqual([1, 0]);
  });
});

describe('ancestorsOf', () => {
  it('gives nothing above the root', () => {
    expect(ancestorsOf(cursorFor('<a />'))).toEqual([]);
  });

  it('lists the ancestors from the root downward', () => {
    const ancestors = ancestorsOf(childAt('<row><b><c /></b></row>', 0, 0));

    expect(ancestors.map(ancestor => pathTo(ancestor))).toEqual([[], [0]]);
  });
});

describe('effectiveParentOf', () => {
  it('gives the parent of a node that is not wrapped in a fragment', () => {
    expect(effectiveParentOf(childAt('<row><a /></row>', 0))?.node).toEqual(parse('<row><a /></row>'));
  });

  it('sees through one fragment', () => {
    expect(effectiveParentOf(childAt('<ul><><li /></></ul>', 0, 0))?.node).toEqual(parse('<ul><><li /></></ul>'));
  });

  it('sees through several nested fragments', () => {
    const cursor = childAt('<ul><><><li /></></></ul>', 0, 0, 0);

    expect(effectiveParentOf(cursor)?.node).toEqual(parse('<ul><><><li /></></></ul>'));
  });

  it('gives nothing when every ancestor up to the root is a fragment', () => {
    expect(effectiveParentOf(childAt('<><a /></>', 0))).toBeUndefined();
  });

  it('gives nothing above the root', () => {
    expect(effectiveParentOf(cursorFor('<a />'))).toBeUndefined();
  });
});

describe('effectiveChildrenOf', () => {
  it('gives the children unchanged when none of them is a fragment', () => {
    const children = effectiveChildrenOf(cursorFor('<row><a /><b /></row>'));

    expect(children.map(child => child.node)).toEqual([parse('<a />'), parse('<b />')]);
  });

  it('replaces a fragment with its own children, in place', () => {
    const children = effectiveChildrenOf(cursorFor('<row><a /><><b /><c /></><d /></row>'));

    expect(children.map(child => child.node)).toEqual([parse('<a />'), parse('<b />'), parse('<c />'), parse('<d />')]);
  });

  it('flattens nested fragments', () => {
    const children = effectiveChildrenOf(cursorFor('<row><><><a /></><b /></></row>'));

    expect(children.map(child => child.node)).toEqual([parse('<a />'), parse('<b />')]);
  });

  it('drops a fragment holding nothing', () => {
    expect(effectiveChildrenOf(cursorFor('<row><></></row>'))).toEqual([]);
  });

  it('gives nothing for a text node', () => {
    expect(effectiveChildrenOf(childAt('<p>hi</p>', 0))).toEqual([]);
  });
});

describe('the cursor kind predicates', () => {
  it('recognizes an element', () => {
    expect(isElementCursor(cursorFor('<a />'))).toBe(true);
  });

  it('rejects a fragment as an element', () => {
    expect(isElementCursor(cursorFor('<></>'))).toBe(false);
  });

  it('recognizes a fragment', () => {
    expect(isFragmentCursor(cursorFor('<></>'))).toBe(true);
  });

  it('rejects an element as a fragment', () => {
    expect(isFragmentCursor(cursorFor('<a />'))).toBe(false);
  });
});

describe('isParentNode', () => {
  it('accepts an element', () => {
    expect(isParentNode(parse('<a />'))).toBe(true);
  });

  it('accepts a fragment', () => {
    expect(isParentNode(parse('<></>'))).toBe(true);
  });

  it('rejects a text node', () => {
    expect(isParentNode(text('hi'))).toBe(false);
  });
});
