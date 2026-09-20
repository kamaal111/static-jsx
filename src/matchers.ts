import { ancestorsOf, effectiveChildrenOf, effectiveParentOf, type JSXMatcher } from './cursor.ts';
import { walk } from './walk.ts';

/**
 * Matches a node whose effective parent matches — the `A > B` combinator. A fragment is glue rather
 * than structure, so it is never anyone's parent and `withParent` is never true of a fragment.
 */
export function withParent(matcher: JSXMatcher): JSXMatcher {
  return cursor => {
    const parent = effectiveParentOf(cursor);

    return parent !== undefined && matcher(parent);
  };
}

/** Matches a node with any ancestor that matches — the `A B` combinator. Fragments count here. */
export function withAncestor(matcher: JSXMatcher): JSXMatcher {
  return cursor => ancestorsOf(cursor).some(ancestor => matcher(ancestor));
}

/** Matches a node with any effective child that matches. A fragment child is flattened into its holder. */
export function withChild(matcher: JSXMatcher): JSXMatcher {
  return cursor => effectiveChildrenOf(cursor).some(child => matcher(child));
}

/**
 * Matches a node with any descendant that matches. Each candidate walks its own subtree, so searching
 * a whole document for this costs a pass per node rather than a single pass.
 */
export function withDescendant(matcher: JSXMatcher): JSXMatcher {
  return cursor => {
    for (const descendant of walk(cursor)) {
      if (descendant !== cursor && matcher(descendant)) {
        return true;
      }
    }

    return false;
  };
}
