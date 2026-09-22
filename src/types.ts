/** Any value that survives a JSON round-trip. */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** The attributes of an element, in the order they appeared in the source. */
export type JSXAttributes = Record<string, JsonValue>;

/** A `<name …>` element. `attributes` and `children` are always present, so the JSON shape is stable. */
export interface JSXElement {
  type: typeof JSX_NODE_TYPES.ELEMENT;
  name: string;
  attributes: JSXAttributes;
  children: JSXNode[];
}

/** A `<>…</>` fragment. */
export interface JSXFragment {
  type: typeof JSX_NODE_TYPES.FRAGMENT;
  children: JSXNode[];
}

/** A run of literal text, with its whitespace already normalized and its entities decoded. */
export interface JSXText {
  type: typeof JSX_NODE_TYPES.TEXT;
  value: string;
}

/** A `{…}` container holding a single JSON value. */
export interface JSXExpression {
  type: typeof JSX_NODE_TYPES.EXPRESSION;
  value: JsonValue;
}

export type JSXNode = JSXElement | JSXFragment | JSXText | JSXExpression;

/** What a document may have at its top level: exactly one element or one fragment. */
export type JSXRootNode = JSXElement | JSXFragment;

export const JSX_NODE_TYPES = {
  ELEMENT: 'element',
  FRAGMENT: 'fragment',
  TEXT: 'text',
  EXPRESSION: 'expression',
} as const;
