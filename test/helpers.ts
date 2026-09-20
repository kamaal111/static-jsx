import { JSXSyntaxError } from '../src/errors.ts';
import { parse, type ParseOptions } from '../src/parser.ts';
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

export function syntaxErrorOrUndefined(source: string, options?: ParseOptions): JSXSyntaxError | undefined {
  try {
    parse(source, options);
  } catch (error) {
    if (error instanceof JSXSyntaxError) {
      return error;
    }

    throw error;
  }

  return undefined;
}

export function syntaxErrorFrom(source: string, options?: ParseOptions): JSXSyntaxError {
  const error = syntaxErrorOrUndefined(source, options);

  if (error === undefined) {
    throw new Error(`Expected ${JSON.stringify(source)} to be rejected, but it parsed`);
  }

  return error;
}
