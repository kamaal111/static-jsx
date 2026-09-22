import { isNode, isParentNode, type JSXCursor, makeChildCursor, rootCursor } from './cursor.ts';
import type { JSXNode, JSXRootNode } from './types.ts';
import { invariant } from './utils.ts';

/**
 * Yields a cursor for every node from `from` down, in document order, lazily.
 *
 * Starting from a cursor keeps its absolute depth and its real ancestors, so a matcher asking about
 * what is above still sees past the node the walk started at.
 */
export function* walk(from: JSXRootNode | JSXCursor): Generator<JSXCursor, void, undefined> {
  // The stack holds the pending frontier rather than one frame per level, which is what keeps this
  // iterative: a document nested past the call-stack limit still walks.
  const stack: JSXCursor[] = [toCursor(from)];

  for (let cursor = stack.pop(); cursor !== undefined; cursor = stack.pop()) {
    yield cursor;

    if (!isParentNode(cursor.node)) {
      continue;
    }

    const { children } = cursor.node;

    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child: JSXNode | undefined = children[index];

      invariant(child !== undefined, 'An index below the children length always resolves');
      stack.push(makeChildCursor(cursor, child, index));
    }
  }
}

function toCursor(from: JSXRootNode | JSXCursor): JSXCursor {
  return isNode(from) ? rootCursor(from) : from;
}
