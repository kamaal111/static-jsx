import { escapeAttribute, escapeText } from './entities.ts';
import { JSXStringifyError } from './errors.ts';
import { isJsonContainer, isJsonString, isUnwritableNumber, type JsonContainer } from './json-values.ts';
import { isAttributeName, isElementName } from './names.ts';
import type { JSXAttributes, JSXElement, JSXFragment, JSXNode, JSXRootNode, JsonValue } from './types.ts';
import { invariant } from './utils.ts';

const DEFAULT_INDENT = '  ';

/** Anything but layout in the indent would be read back as text, so the indent is held to these. */
const NON_LAYOUT = /[^ \t\r\n]/;

const UNWRITABLE_NUMBER_MESSAGE =
  'A value holds Infinity, -Infinity, NaN or -0, which JSON writes as null or 0, so it would not read back';

const JSON_TASK_KINDS = { VALUE: 'value', LITERAL: 'literal', LEAVE: 'leave' } as const;

const WRITE_TASK_KINDS = { NODE: 'node', LITERAL: 'literal' } as const;

export interface StringifyOptions {
  /** The string one level of nesting is indented with. Defaults to two spaces. */
  indent?: string;
}

interface ValueJsonTask {
  readonly kind: typeof JSON_TASK_KINDS.VALUE;
  readonly value: JsonValue;
}

interface LiteralJsonTask {
  readonly kind: typeof JSON_TASK_KINDS.LITERAL;
  readonly text: string;
}

interface LeaveJsonTask {
  readonly kind: typeof JSON_TASK_KINDS.LEAVE;
  readonly container: JsonContainer;
}

/** One step of JSON-writing work: a value still to be written, ready-made text, or a container to leave. */
type JsonTask = ValueJsonTask | LiteralJsonTask | LeaveJsonTask;

interface NodeWriteTask {
  readonly kind: typeof WRITE_TASK_KINDS.NODE;
  readonly node: JSXNode;
  readonly depth: number;
}

interface LiteralWriteTask {
  readonly kind: typeof WRITE_TASK_KINDS.LITERAL;
  readonly text: string;
}

/** One step of work: either a node still to be written, or text that is ready to go out as-is. */
type WriteTask = NodeWriteTask | LiteralWriteTask;

function makeNodeWriteTask(opts: Omit<NodeWriteTask, 'kind'>): NodeWriteTask {
  return { kind: WRITE_TASK_KINDS.NODE, node: opts.node, depth: opts.depth };
}

function makeLiteralWriteTask(opts: Omit<LiteralWriteTask, 'kind'>): LiteralWriteTask {
  return { kind: WRITE_TASK_KINDS.LITERAL, text: opts.text };
}

/**
 * Prints a node back to JSX. Parsing the result returns an equal tree, and printing that tree
 * returns an equal string.
 *
 * Children go on their own indented lines, except when one of them is text: a node with any text
 * child is printed on a single line, because inserted line breaks would be swallowed by whitespace
 * normalization and would take the text's own leading and trailing spaces with them.
 *
 * Rather than print something that would not read back, this throws a {@link JSXStringifyError} for
 * a tree `parse` could never have produced: an unwritable number, a name that is not a name, an
 * empty or doubled text node, or an indent holding anything but layout.
 *
 * @throws {JSXStringifyError} when the tree or the options would not survive a round trip.
 */
export function stringify(node: JSXRootNode, options?: StringifyOptions): string {
  const indentUnit = options?.indent ?? DEFAULT_INDENT;

  if (NON_LAYOUT.test(indentUnit)) {
    throw new JSXStringifyError(
      'The indent may hold only spaces, tabs and line breaks, or it would be read back as text',
    );
  }

  const chunks: string[] = [];
  const stack: WriteTask[] = [makeNodeWriteTask({ node, depth: 0 })];

  for (let task = stack.pop(); task !== undefined; task = stack.pop()) {
    if (task.kind === WRITE_TASK_KINDS.LITERAL) {
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
    chunks.push(`{${jsonText(node.value)}}`);

    return;
  }

  const isElement = node.type === 'element';

  if (isElement && !isElementName(node.name)) {
    throw new JSXStringifyError(`"${node.name}" cannot be written as an element name`);
  }

  if (node.children.length === 0) {
    chunks.push(isElement ? `<${node.name}${attributesText(node.attributes)} />` : '<></>');

    return;
  }

  const inline = inspectChildren(node.children);
  chunks.push(isElement ? `<${node.name}${attributesText(node.attributes)}>` : '<>');
  pushChildren(stack, node, depth, indentUnit, inline);
}

/** Queues a node's children, plus its closing tag, in the order they should be written. */
function pushChildren(
  stack: WriteTask[],
  node: JSXElement | JSXFragment,
  depth: number,
  indentUnit: string,
  inline: boolean,
): void {
  const { children } = node;

  stack.push(makeLiteralWriteTask({ text: node.type === 'element' ? `</${node.name}>` : '</>' }));

  if (!inline) {
    stack.push(makeLiteralWriteTask({ text: `\n${indentUnit.repeat(depth)}` }));
  }

  for (const child of children.toReversed()) {
    stack.push(makeNodeWriteTask({ node: child, depth: depth + 1 }));

    if (!inline) {
      stack.push(makeLiteralWriteTask({ text: `\n${indentUnit.repeat(depth + 1)}` }));
    }
  }
}

/**
 * Decides whether the children go on one line, and rejects the two text nodes that could not be
 * read back: an empty one leaves no trace in the output, and one following another would come back
 * as a single merged node.
 */
function inspectChildren(children: readonly JSXNode[]): boolean {
  let hasText = false;
  let previousWasText = false;

  children.forEach(child => {
    if (child.type !== 'text') {
      previousWasText = false;

      return;
    }

    if (child.value.length === 0) {
      throw new JSXStringifyError('An empty text node cannot be written, because parsing drops it again');
    }

    if (previousWasText) {
      throw new JSXStringifyError('Two text nodes in a row cannot be written, because parsing merges them into one');
    }

    hasText = true;
    previousWasText = true;
  });

  return hasText;
}

function attributesText(attributes: JSXAttributes): string {
  let text = '';

  Object.entries(attributes).forEach(([name, value]) => {
    text += attributeText(name, value);
  });

  return text;
}

/** A bare name means `true`, a quoted value means a string, and everything else is JSON in braces. */
function attributeText(name: string, value: JsonValue): string {
  if (!isAttributeName(name)) {
    throw new JSXStringifyError(`"${name}" cannot be written as an attribute name`);
  }

  if (value === true) {
    return ` ${name}`;
  }

  if (isJsonString(value)) {
    return ` ${name}="${escapeAttribute(value)}"`;
  }

  return ` ${name}={${jsonText(value)}}`;
}

/**
 * The JSON text for a value, refusing the values `JSON.stringify` would quietly rewrite instead of
 * report. Only a container can hide one, or be circular, so a plain number or string — which is most
 * of what a document holds — takes the short path and pays for none of that.
 */
function jsonText(value: JsonValue): string {
  if (!isJsonContainer(value)) {
    return scalarJsonText(value);
  }

  return containerJsonText(value);
}

/** A value holding nothing else is either writable or it is not: there is nothing to search. */
function scalarJsonText(value: JsonValue): string {
  if (isUnwritableNumber(value)) {
    throw new JSXStringifyError(UNWRITABLE_NUMBER_MESSAGE);
  }

  const text: string | undefined = JSON.stringify(value);

  if (text === undefined) {
    throw new JSXStringifyError('A value that is not JSON cannot be written');
  }

  return text;
}

function makeValueJsonTask(opts: Omit<ValueJsonTask, 'kind'>): ValueJsonTask {
  return { kind: JSON_TASK_KINDS.VALUE, value: opts.value };
}

function makeLeaveJsonTask(opts: Omit<LeaveJsonTask, 'kind'>): LeaveJsonTask {
  return { kind: JSON_TASK_KINDS.LEAVE, container: opts.container };
}

function makeLiteralJsonTask(opts: Omit<LiteralJsonTask, 'kind'>): LiteralJsonTask {
  return { kind: JSON_TASK_KINDS.LITERAL, text: opts.text };
}

/**
 * Writes a container as JSON with an explicit stack rather than recursion, so nothing here pays for
 * the call stack `JSON.stringify` spends walking into a value — and so a value that refers to itself
 * is caught as it is entered, rather than left for the engine to refuse however it sees fit.
 */
function containerJsonText(root: JsonContainer): string {
  const chunks: string[] = [];
  const openAncestors = new Set<JsonContainer>();
  const stack: JsonTask[] = [makeValueJsonTask({ value: root })];

  for (let task = stack.pop(); task !== undefined; task = stack.pop()) {
    if (task.kind === JSON_TASK_KINDS.LITERAL) {
      chunks.push(task.text);
      continue;
    }

    if (task.kind === JSON_TASK_KINDS.LEAVE) {
      openAncestors.delete(task.container);
      continue;
    }

    writeJsonValue(chunks, stack, openAncestors, task.value);
  }

  return chunks.join('');
}

function writeJsonValue(
  chunks: string[],
  stack: JsonTask[],
  openAncestors: Set<JsonContainer>,
  value: JsonValue,
): void {
  if (!isJsonContainer(value)) {
    if (isUnwritableNumber(value)) {
      throw new JSXStringifyError(UNWRITABLE_NUMBER_MESSAGE);
    }

    chunks.push(JSON.stringify(value));

    return;
  }

  if (openAncestors.has(value)) {
    throw new JSXStringifyError('A value could not be written as JSON, because it is circular or nested too deeply');
  }

  openAncestors.add(value);
  stack.push(makeLeaveJsonTask({ container: value }));

  if (Array.isArray(value)) {
    chunks.push('[');
    stack.push(makeLiteralJsonTask({ text: ']' }));
    pushArrayElements(stack, value);
  } else {
    chunks.push('{');
    stack.push(makeLiteralJsonTask({ text: '}' }));
    pushObjectEntries(stack, Object.entries(value));
  }
}

function pushArrayElements(stack: JsonTask[], elements: readonly JsonValue[]): void {
  const reversed = elements.toReversed();
  let remaining = reversed.length;

  reversed.forEach(value => {
    stack.push(makeValueJsonTask({ value }));
    remaining--;

    if (remaining > 0) {
      stack.push(makeLiteralJsonTask({ text: ',' }));
    }
  });
}

function pushObjectEntries(stack: JsonTask[], entries: readonly (readonly [string, JsonValue])[]): void {
  let remaining = entries.length;

  entries.forEach((_, i, arr) => {
    const item = arr[entries.length - 1 - i];

    invariant(item !== undefined, 'Invariant detected, item should resolve and never be null');

    const [key, value] = item;

    stack.push(makeValueJsonTask({ value }));
    stack.push(makeLiteralJsonTask({ text: `${JSON.stringify(key)}:` }));
    remaining--;

    if (remaining > 0) {
      stack.push(makeLiteralJsonTask({ text: ',' }));
    }
  });
}
