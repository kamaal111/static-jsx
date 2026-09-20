import { type JSXCursor, type JSXMatcher, rootCursor } from '../src/cursor.ts';
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

export function makeAttributes(entries: JSXAttributes = {}): JSXAttributes {
  const attributes: JSXAttributes = Object.create(null);

  for (const [name, value] of Object.entries(entries)) {
    Object.defineProperty(attributes, name, { value, writable: true, enumerable: true, configurable: true });
  }

  return attributes;
}

export function element(name: string, attributes: JSXAttributes = {}, children: JSXNode[] = []): JSXElement {
  return { type: 'element', name, attributes: makeAttributes(attributes), children };
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

export function named(name: string) {
  return (cursor: JSXCursor): cursor is JSXCursor<JSXElement> =>
    cursor.node.type === 'element' && cursor.node.name === name;
}

export function ofType(type: JSXNode['type']): JSXMatcher {
  return cursor => cursor.node.type === type;
}

export function withAttribute(name: string): JSXMatcher {
  return cursor => cursor.node.type === 'element' && Object.hasOwn(cursor.node.attributes, name);
}

export function pathTo(cursor: JSXCursor): number[] {
  const path: number[] = [];

  for (let step: JSXCursor | undefined = cursor; step?.parent !== undefined; step = step.parent) {
    path.push(step.index);
  }

  return path.reverse();
}

export function cursorFor(source: string): JSXCursor {
  return rootCursor(parse(source));
}

export function label(cursor: JSXCursor): string {
  return cursor.node.type === 'element' ? cursor.node.name : cursor.node.type;
}
