import type {
  JSXAttributes,
  JSXElement,
  JSXExpression,
  JSXFragment,
  JSXNode,
  JSXText,
  JsonValue,
} from '../src/types.ts';

export function element(name: string, attributes: JSXAttributes = {}, children: JSXNode[] = []): JSXElement {
  return { type: 'element', name, attributes, children };
}

export function fragment(children: JSXNode[] = []): JSXFragment {
  return { type: 'fragment', children };
}

export function text(value: string): JSXText {
  return { type: 'text', value };
}

export function expression(value: JsonValue): JSXExpression {
  return { type: 'expression', value };
}

export function asElement(node: JSXNode): JSXElement {
  if (node.type !== 'element') {
    throw new Error(`Expected an element, but got a ${node.type}`);
  }

  return node;
}
