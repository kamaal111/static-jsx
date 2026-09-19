import { escapeAttribute, escapeText } from './entities.ts';
import type { JSXAttributes, JSXElement, JSXFragment, JSXNode, JsonValue } from './types.ts';

export interface StringifyOptions {
  /** The string one level of nesting is indented with. Defaults to two spaces. */
  indent?: string;
}

const DEFAULT_INDENT = '  ';

/** One step of work: either a node still to be written, or text that is ready to go out as-is. */
type WriteTask =
  | { readonly kind: 'node'; readonly node: JSXNode; readonly depth: number }
  | { readonly kind: 'literal'; readonly text: string };

/**
 * Prints a node back to JSX. Parsing the result returns an equal tree, and printing that tree
 * returns an equal string.
 *
 * Children go on their own indented lines, except when one of them is text: a node with any text
 * child is printed on a single line, because inserted line breaks would be swallowed by whitespace
 * normalization and would take the text's own leading and trailing spaces with them.
 */
export function stringify(node: JSXNode, options?: StringifyOptions): string {
  const indentUnit = options?.indent ?? DEFAULT_INDENT;
  const chunks: string[] = [];
  const stack: WriteTask[] = [{ kind: 'node', node, depth: 0 }];

  for (let task = stack.pop(); task !== undefined; task = stack.pop()) {
    if (task.kind === 'literal') {
      chunks.push(task.text);
      continue;
    }

    writeNode(chunks, stack, task.node, task.depth, indentUnit);
  }

  return chunks.join('');
}

function writeNode(chunks: string[], stack: WriteTask[], node: JSXNode, depth: number, indentUnit: string): void {
  if (node.type === 'text') {
    chunks.push(escapeText(node.value));

    return;
  }

  if (node.type === 'expression') {
    chunks.push(`{${JSON.stringify(node.value)}}`);

    return;
  }

  const isElement = node.type === 'element';

  if (node.children.length === 0) {
    chunks.push(isElement ? `<${node.name}${attributesText(node.attributes)} />` : '<></>');

    return;
  }

  chunks.push(isElement ? `<${node.name}${attributesText(node.attributes)}>` : '<>');
  pushChildren(stack, node, depth, indentUnit);
}

/** Queues a node's children, plus its closing tag, in the order they should be written. */
function pushChildren(stack: WriteTask[], node: JSXElement | JSXFragment, depth: number, indentUnit: string): void {
  const { children } = node;
  const inline = hasTextChild(children);

  stack.push({ kind: 'literal', text: node.type === 'element' ? `</${node.name}>` : '</>' });

  if (!inline) {
    stack.push({ kind: 'literal', text: `\n${indentUnit.repeat(depth)}` });
  }

  for (const child of children.toReversed()) {
    stack.push({ kind: 'node', node: child, depth: depth + 1 });

    if (!inline) {
      stack.push({ kind: 'literal', text: `\n${indentUnit.repeat(depth + 1)}` });
    }
  }
}

function hasTextChild(children: readonly JSXNode[]): boolean {
  for (const child of children) {
    if (child.type === 'text') {
      return true;
    }
  }

  return false;
}

function attributesText(attributes: JSXAttributes): string {
  let text = '';

  for (const [name, value] of Object.entries(attributes)) {
    text += attributeText(name, value);
  }

  return text;
}

/** A bare name means `true`, a quoted value means a string, and everything else is JSON in braces. */
function attributeText(name: string, value: JsonValue): string {
  if (value === true) {
    return ` ${name}`;
  }

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a printer dispatches on the value's own kind
  if (typeof value === 'string') {
    return ` ${name}="${escapeAttribute(value)}"`;
  }

  return ` ${name}={${JSON.stringify(value)}}`;
}
