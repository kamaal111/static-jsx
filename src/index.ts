export { ancestorsOf, childrenOf, isElementCursor, type JSXCursor, type JSXMatcher } from './cursor.ts';

export { JSXLimitError, type JSXLimit, JSXStringifyError, JSXSyntaxError, StaticJSXError } from './errors.ts';

export { withAncestor, withChild, withDescendant, withParent } from './matchers.ts';

export { parse, type ParseOptions } from './parser.ts';

export { closest, find, findAll } from './search.ts';

export { stringify, type StringifyOptions } from './stringify.ts';

export type {
  JsonValue,
  JSXAttributes,
  JSXElement,
  JSXExpression,
  JSXFragment,
  JSXNode,
  JSXRootNode,
  JSXText,
} from './types.ts';

export { walk } from './walk.ts';
