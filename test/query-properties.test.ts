import fc from 'fast-check';

import { PROPERTY_OPTIONS, arbFragmentHeavyTree, arbMatcher, arbTree } from './arbitraries.ts';
import { pathTo } from './helpers.ts';
import { ancestorsOf, childrenOf, isParentNode, type JSXCursor, type JSXMatcher } from '../src/cursor.ts';
import { withAncestor, withChild, withDescendant, withParent } from '../src/matchers.ts';
import { closest, find, findAll } from '../src/search.ts';
import type { JSXNode, JSXRootNode } from '../src/types.ts';
import { walk } from '../src/walk.ts';

const HOLDS = 'holds';

function nodeAtPath(root: JSXRootNode, path: readonly number[]): JSXNode | undefined {
  let node: JSXNode = root;

  for (const index of path) {
    if (!isParentNode(node)) {
      return undefined;
    }

    const child: JSXNode | undefined = node.children[index];

    if (child === undefined) {
      return undefined;
    }

    node = child;
  }

  return node;
}

function countNodes(root: JSXRootNode): number {
  const stack: JSXNode[] = [root];
  let total = 0;

  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    total += 1;

    if (isParentNode(node)) {
      stack.push(...node.children);
    }
  }

  return total;
}

function isBefore(earlier: readonly number[], later: readonly number[]): boolean {
  for (let step = 0; step < Math.min(earlier.length, later.length); step += 1) {
    const left = earlier[step];
    const right = later[step];

    if (left !== right) {
      return left !== undefined && right !== undefined && left < right;
    }
  }

  return earlier.length < later.length;
}

function visitedOnceVerdict(tree: JSXRootNode): string {
  const cursors = Array.from(walk(tree));
  const nodes = new Set(cursors.map(cursor => cursor.node));

  if (cursors.length !== countNodes(tree)) {
    return `walked ${cursors.length} of ${countNodes(tree)} nodes`;
  }

  return nodes.size === cursors.length ? HOLDS : 'walked the same node twice';
}

function pathResolvesVerdict(tree: JSXRootNode): string {
  for (const cursor of walk(tree)) {
    if (nodeAtPath(tree, pathTo(cursor)) !== cursor.node) {
      return `path ${JSON.stringify(pathTo(cursor))} resolved to a different node`;
    }
  }

  return HOLDS;
}

function depthAgreesVerdict(tree: JSXRootNode): string {
  for (const cursor of walk(tree)) {
    if (pathTo(cursor).length !== cursor.depth || ancestorsOf(cursor).length !== cursor.depth) {
      return `depth ${cursor.depth} disagrees with its path or ancestors`;
    }
  }

  return HOLDS;
}

function parentInvertsChildrenVerdict(tree: JSXRootNode): string {
  for (const cursor of walk(tree)) {
    for (const child of childrenOf(cursor)) {
      if (child.parent !== cursor) {
        return 'a child did not point back at the cursor it came from';
      }
    }

    const { parent } = cursor;

    if (parent !== undefined && childrenOf(parent)[cursor.index]?.node !== cursor.node) {
      return 'a cursor was not among its parent children at its own index';
    }
  }

  return HOLDS;
}

function documentOrderVerdict(tree: JSXRootNode): string {
  const paths = Array.from(walk(tree), cursor => pathTo(cursor));

  for (let step = 1; step < paths.length; step += 1) {
    const earlier = paths[step - 1];
    const later = paths[step];

    if (earlier === undefined || later === undefined || !isBefore(earlier, later)) {
      return 'two nodes came out of document order';
    }
  }

  return HOLDS;
}

function rootVerdict(tree: JSXRootNode): string {
  for (const cursor of walk(tree)) {
    let step = cursor;

    while (step.parent !== undefined) {
      step = step.parent;
    }

    if (step.node !== tree) {
      return 'a cursor climbed to something other than the document root';
    }

    if ((cursor.parent === undefined) !== (cursor.depth === 0)) {
      return 'a cursor disagreed about being the root';
    }
  }

  return HOLDS;
}

describe('walking any tree', () => {
  it('yields every node exactly once', () => {
    fc.assert(
      fc.property(arbTree, tree => {
        expect(visitedOnceVerdict(tree), `tree: ${JSON.stringify(tree)}`).toBe(HOLDS);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it('yields nodes in document order', () => {
    fc.assert(
      fc.property(arbTree, tree => {
        expect(documentOrderVerdict(tree), `tree: ${JSON.stringify(tree)}`).toBe(HOLDS);
      }),
      PROPERTY_OPTIONS,
    );
  });
});

describe('the cursor a walk yields', () => {
  it('carries a path that resolves back to the very same node', () => {
    fc.assert(
      fc.property(arbTree, tree => {
        expect(pathResolvesVerdict(tree), `tree: ${JSON.stringify(tree)}`).toBe(HOLDS);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it('agrees with its own path and ancestors about its depth', () => {
    fc.assert(
      fc.property(arbTree, tree => {
        expect(depthAgreesVerdict(tree), `tree: ${JSON.stringify(tree)}`).toBe(HOLDS);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it('is the parent of each of its children, and a child of its own parent', () => {
    fc.assert(
      fc.property(arbTree, tree => {
        expect(parentInvertsChildrenVerdict(tree), `tree: ${JSON.stringify(tree)}`).toBe(HOLDS);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it('climbs to the document root, and knows whether it is one', () => {
    fc.assert(
      fc.property(arbTree, tree => {
        expect(rootVerdict(tree), `tree: ${JSON.stringify(tree)}`).toBe(HOLDS);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it('is what walking from it yields first', () => {
    fc.assert(
      fc.property(arbTree, tree => {
        const cursors: JSXCursor[] = Array.from(walk(tree));

        expect(cursors.map(cursor => Array.from(walk(cursor))[0]?.node)).toEqual(cursors.map(cursor => cursor.node));
      }),
      PROPERTY_OPTIONS,
    );
  });
});

function impliesVerdict(tree: JSXRootNode, narrower: JSXMatcher, wider: JSXMatcher): string {
  for (const cursor of walk(tree)) {
    if (narrower(cursor) && !wider(cursor)) {
      return `a node at ${JSON.stringify(pathTo(cursor))} matched the narrower but not the wider`;
    }
  }

  return HOLDS;
}

function searchAgreesVerdict(tree: JSXRootNode, matcher: JSXMatcher): string {
  const all = Array.from(findAll(tree, matcher));
  const byHand = Array.from(walk(tree)).filter(cursor => matcher(cursor));

  if (all.length !== byHand.length) {
    return `findAll gave ${all.length} of ${byHand.length} matches`;
  }

  if (find(tree, matcher)?.node !== all[0]?.node) {
    return 'find was not the first of findAll';
  }

  return (find(tree, matcher) === undefined) === (all.length === 0)
    ? HOLDS
    : 'find disagreed about there being a match';
}

function closestVerdict(tree: JSXRootNode, matcher: JSXMatcher): string {
  for (const cursor of walk(tree)) {
    const upward = [cursor, ...ancestorsOf(cursor).toReversed()];
    const expected = upward.find(step => matcher(step));

    if (closest(cursor, matcher) !== expected) {
      return `closest disagreed at ${JSON.stringify(pathTo(cursor))}`;
    }
  }

  return HOLDS;
}

describe('the structural combinators', () => {
  it('match an ancestor wherever they match a parent', () => {
    fc.assert(
      fc.property(arbFragmentHeavyTree, arbMatcher, (tree, matcher) => {
        expect(impliesVerdict(tree, withParent(matcher), withAncestor(matcher))).toBe(HOLDS);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it('match a descendant wherever they match a child', () => {
    fc.assert(
      fc.property(arbFragmentHeavyTree, arbMatcher, (tree, matcher) => {
        expect(impliesVerdict(tree, withChild(matcher), withDescendant(matcher))).toBe(HOLDS);
      }),
      PROPERTY_OPTIONS,
    );
  });
});

describe('searching any tree', () => {
  it('agrees with walking it and filtering by hand', () => {
    fc.assert(
      fc.property(arbTree, arbMatcher, (tree, matcher) => {
        expect(searchAgreesVerdict(tree, matcher)).toBe(HOLDS);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it('finds the deepest ancestor-or-self match when asked for the closest', () => {
    fc.assert(
      fc.property(arbTree, arbMatcher, (tree, matcher) => {
        expect(closestVerdict(tree, matcher)).toBe(HOLDS);
      }),
      PROPERTY_OPTIONS,
    );
  });
});
