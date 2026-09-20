import type { JSXCursor, JSXElementMatcher, JSXMatcher } from './cursor.ts';
import type { JSXElement, JSXRootNode } from './types.ts';
import { walk } from './walk.ts';

/** The first node in document order that matches, or `undefined` when none does. Stops at the hit. */
export function find(from: JSXRootNode | JSXCursor, matcher: JSXElementMatcher): JSXCursor<JSXElement> | undefined;
export function find(from: JSXRootNode | JSXCursor, matcher: JSXMatcher): JSXCursor | undefined;
export function find(from: JSXRootNode | JSXCursor, matcher: JSXMatcher): JSXCursor | undefined {
  for (const cursor of walk(from)) {
    if (matcher(cursor)) {
      return cursor;
    }
  }

  return undefined;
}

/** Every node that matches, in document order, lazily. `Array.from` it when an array is wanted. */
export function findAll(
  from: JSXRootNode | JSXCursor,
  matcher: JSXElementMatcher,
): Generator<JSXCursor<JSXElement>, void, undefined>;
export function findAll(from: JSXRootNode | JSXCursor, matcher: JSXMatcher): Generator<JSXCursor, void, undefined>;
export function* findAll(from: JSXRootNode | JSXCursor, matcher: JSXMatcher): Generator<JSXCursor, void, undefined> {
  for (const cursor of walk(from)) {
    if (matcher(cursor)) {
      yield cursor;
    }
  }
}

/** The nearest cursor at or above this one whose node matches, like the DOM's `closest`. */
export function closest(cursor: JSXCursor, matcher: JSXElementMatcher): JSXCursor<JSXElement> | undefined;
export function closest(cursor: JSXCursor, matcher: JSXMatcher): JSXCursor | undefined;
export function closest(cursor: JSXCursor, matcher: JSXMatcher): JSXCursor | undefined {
  for (let step: JSXCursor | undefined = cursor; step !== undefined; step = step.parent) {
    if (matcher(step)) {
      return step;
    }
  }

  return undefined;
}
