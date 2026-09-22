import type { JSXElement, JSXFragment, JSXNode, JSXRootNode } from './types.ts';
import { invariant } from './utils.ts';

const ROOT_INDEX = -1;

/**
 * A node together with the way down to it. A traversal builds cursors as it goes and a caller may
 * drop them; nothing is ever written to the tree, so a node stays the plain JSON `parse` returned.
 */
export interface JSXCursor<Node extends JSXNode = JSXNode> {
  /** The node this cursor is at. */
  readonly node: Node;
  /** The cursor for the node holding this one, or `undefined` at the root. */
  readonly parent: JSXCursor | undefined;
  /** This node's index among its parent's children; `-1` at the root. */
  readonly index: number;
  /** How many nodes stand between this one and the root; `0` at the root. */
  readonly depth: number;
}

/** A cursor at a document's root, where there is nothing above and the node can only be a root node. */
interface JSXRootCursor extends JSXCursor<JSXRootNode> {
  readonly parent: undefined;
}

/** A question asked of a position in a tree. Combinators build bigger questions out of smaller ones. */
export type JSXMatcher = (cursor: JSXCursor) => boolean;

/** A matcher that can only be true at an element, so whatever it matches is typed as one. */
export type JSXElementMatcher = (cursor: JSXCursor) => cursor is JSXCursor<JSXElement>;

/** A cursor at the root of a document, which is where stepping down through a tree begins. */
export function rootCursor(root: JSXRootNode): JSXRootCursor {
  return { node: root, parent: undefined, index: ROOT_INDEX, depth: 0 };
}

export function makeChildCursor(parent: JSXCursor, node: JSXNode, index: number): JSXCursor {
  return { node, parent, index, depth: parent.depth + 1 };
}

/** Tells a bare node from a cursor at one: only a node carries a `type`. */
export function isNode(from: JSXNode | JSXCursor): from is JSXNode {
  return 'type' in from;
}

/** The two node kinds that hold children. */
export function isParentNode(node: JSXNode): node is JSXElement | JSXFragment {
  return node.type === 'element' || node.type === 'fragment';
}

/** Whether a cursor is at an element, so its `name` and `attributes` can be read. */
export function isElementCursor(cursor: JSXCursor): cursor is JSXCursor<JSXElement> {
  return cursor.node.type === 'element';
}

export function isFragmentCursor(cursor: JSXCursor): cursor is JSXCursor<JSXFragment> {
  return cursor.node.type === 'fragment';
}

/** Every cursor above this one, from the root down to its parent. */
export function ancestorsOf(cursor: JSXCursor): readonly JSXCursor[] {
  const ancestors: JSXCursor[] = [];

  for (let step = cursor.parent; step !== undefined; step = step.parent) {
    ancestors.push(step);
  }

  return ancestors.toReversed();
}

/** A cursor for each child, in order. Empty for text and expression nodes. */
export function childrenOf(cursor: JSXCursor): readonly JSXCursor[] {
  if (!isParentNode(cursor.node)) {
    return [];
  }

  return cursor.node.children.map((child, index) => makeChildCursor(cursor, child, index));
}

/**
 * The nearest ancestor that is not a fragment — what the child combinator treats as the parent.
 * `undefined` when every ancestor up to the root is a fragment, so a fragment is never a parent.
 */
export function effectiveParentOf(cursor: JSXCursor): JSXCursor | undefined {
  for (let step = cursor.parent; step !== undefined; step = step.parent) {
    if (!isFragmentCursor(step)) {
      return step;
    }
  }

  return undefined;
}

/** The children, with every fragment replaced in place by its own effective children. */
export function effectiveChildrenOf(cursor: JSXCursor): readonly JSXCursor[] {
  const effective: JSXCursor[] = [];
  const pending = childrenOf(cursor).toReversed();

  for (let child = pending.pop(); child !== undefined; child = pending.pop()) {
    if (!isFragmentCursor(child)) {
      effective.push(child);
      continue;
    }

    const nested = childrenOf(child);

    for (let index = nested.length - 1; index >= 0; index -= 1) {
      const grandchild: JSXCursor | undefined = nested[index];

      invariant(grandchild !== undefined, 'An index below the children length always resolves');
      pending.push(grandchild);
    }
  }

  return effective;
}
