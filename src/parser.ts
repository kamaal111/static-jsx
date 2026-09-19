import { decodeEntities } from './entities.ts';
import { JSXSyntaxError } from './errors.ts';
import type { JSXAttributes, JSXElement, JSXFragment, JSXNode, JSXRootNode, JsonValue } from './types.ts';
import { normalizeText } from './whitespace.ts';

const TAB = 0x09;

const LINE_FEED = 0x0a;

const CARRIAGE_RETURN = 0x0d;

const SPACE = 0x20;

const DOUBLE_QUOTE = 0x22;

const DOLLAR_SIGN = 0x24;

const AMPERSAND = 0x26;

const SINGLE_QUOTE = 0x27;

const HYPHEN = 0x2d;

const PERIOD = 0x2e;

const SLASH = 0x2f;

const DIGIT_ZERO = 0x30;

const DIGIT_NINE = 0x39;

const COLON = 0x3a;

const LESS_THAN = 0x3c;

const EQUALS_SIGN = 0x3d;

const GREATER_THAN = 0x3e;

const UPPERCASE_A = 0x41;

const UPPERCASE_Z = 0x5a;

const BACKSLASH = 0x5c;

const UNDERSCORE = 0x5f;

const LOWERCASE_A = 0x61;

const LOWERCASE_Z = 0x7a;

const LEFT_BRACE = 0x7b;

const RIGHT_BRACE = 0x7d;

const PROTOTYPE_KEY = '__proto__';

/** A cursor over the source string. The only thing that ever changes while parsing. */
interface Scanner {
  readonly source: string;
  index: number;
}

/** An element or fragment whose children are still being collected, and where its tag began. */
interface OpenNode {
  readonly node: JSXElement | JSXFragment;
  readonly openedAt: number;
}

type Tag =
  | { readonly kind: 'open'; readonly node: JSXElement | JSXFragment; readonly selfClosing: boolean }
  | { readonly kind: 'close'; readonly name: string | undefined };

/**
 * Parses a static JSX document into a JSON-compatible tree.
 *
 * The document must hold exactly one root element or fragment; whitespace around it is ignored.
 *
 * @throws {JSXSyntaxError} when the source is not valid static JSX.
 */
export function parse(source: string): JSXRootNode {
  const scanner: Scanner = { source, index: 0 };
  skipWhitespace(scanner);
  const root = parseTree(scanner);
  skipWhitespace(scanner);

  if (scanner.index < source.length) {
    throw new JSXSyntaxError('Unexpected content after the root node', source, scanner.index);
  }

  return root;
}

/**
 * Walks the whole document with an explicit stack of open nodes rather than recursion, so that
 * deeply nested input cannot exhaust the call stack.
 */
function parseTree(scanner: Scanner): JSXRootNode {
  const { source } = scanner;
  const rootStart = scanner.index;

  if (peek(scanner) !== LESS_THAN) {
    throw new JSXSyntaxError('Expected the document to start with an element or a fragment', source, rootStart);
  }

  const first = readTag(scanner);

  if (first.kind === 'close') {
    throw new JSXSyntaxError('Unexpected closing tag', source, rootStart);
  }

  if (first.selfClosing) {
    return first.node;
  }

  let current: OpenNode = { node: first.node, openedAt: rootStart };
  const ancestors: OpenNode[] = [];

  while (scanner.index < source.length) {
    const code = source.charCodeAt(scanner.index);

    if (code === LEFT_BRACE) {
      current.node.children.push({ type: 'expression', value: readExpression(scanner) });
      continue;
    }

    if (code !== LESS_THAN) {
      appendText(current.node.children, readText(scanner));
      continue;
    }

    const tagStart = scanner.index;
    const tag = readTag(scanner);

    if (tag.kind === 'open') {
      if (tag.selfClosing) {
        current.node.children.push(tag.node);
      } else {
        ancestors.push(current);
        current = { node: tag.node, openedAt: tagStart };
      }

      continue;
    }

    const expectedName = current.node.type === 'element' ? current.node.name : undefined;

    if (tag.name !== expectedName) {
      const reason = `Expected ${closingTagLabel(expectedName)}, but found ${closingTagLabel(tag.name)}`;
      throw new JSXSyntaxError(reason, source, tagStart);
    }

    const parent = ancestors.pop();

    if (parent === undefined) {
      return current.node;
    }

    parent.node.children.push(current.node);
    current = parent;
  }

  throw new JSXSyntaxError(`Expected a closing tag for ${openingTagLabel(current.node)}`, source, current.openedAt);
}

/** Reads one complete tag, starting at its `<`. */
function readTag(scanner: Scanner): Tag {
  const tagStart = scanner.index;
  scanner.index += 1;

  if (peek(scanner) === SLASH) {
    scanner.index += 1;
    const name = readTagName(scanner);
    skipWhitespace(scanner);
    expect(scanner, GREATER_THAN, 'Expected `>` to end the closing tag');

    return { kind: 'close', name };
  }

  const name = readTagName(scanner);

  if (name === undefined) {
    scanner.index += 1;

    return { kind: 'open', node: { type: 'fragment', children: [] }, selfClosing: false };
  }

  const attributes = readAttributes(scanner, tagStart);
  const selfClosing = peek(scanner) === SLASH;

  if (selfClosing) {
    scanner.index += 1;
  }

  expect(scanner, GREATER_THAN, 'Expected `>` to end the opening tag');

  return { kind: 'open', node: { type: 'element', name, attributes, children: [] }, selfClosing };
}

/** Returns `undefined` for a fragment's empty tag, and rejects anything else that is not a name. */
function readTagName(scanner: Scanner): string | undefined {
  const name = readName(scanner);

  if (name === undefined && peek(scanner) !== GREATER_THAN) {
    throw new JSXSyntaxError('Expected a tag name', scanner.source, scanner.index);
  }

  return name;
}

/** Reads attributes until the scanner reaches the `/` or `>` that ends the opening tag. */
function readAttributes(scanner: Scanner, tagStart: number): JSXAttributes {
  const { source } = scanner;
  const attributes: JSXAttributes = {};

  while (true) {
    skipWhitespace(scanner);

    if (scanner.index >= source.length) {
      throw new JSXSyntaxError('Unterminated opening tag', source, tagStart);
    }

    const code = source.charCodeAt(scanner.index);

    if (code === GREATER_THAN || code === SLASH) {
      return attributes;
    }

    const nameStart = scanner.index;
    const name = readName(scanner);

    if (name === undefined) {
      throw new JSXSyntaxError('Expected an attribute name', source, nameStart);
    }

    if (Object.hasOwn(attributes, name)) {
      throw new JSXSyntaxError(`Duplicate attribute "${name}"`, source, nameStart);
    }

    defineAttribute(attributes, name, readAttributeValue(scanner));
  }
}

/** A bare attribute is `true`; otherwise the value is a quoted string or a `{…}` JSON value. */
function readAttributeValue(scanner: Scanner): JsonValue {
  skipWhitespace(scanner);

  if (peek(scanner) !== EQUALS_SIGN) {
    return true;
  }

  scanner.index += 1;
  skipWhitespace(scanner);
  const code = peek(scanner);

  if (code === LEFT_BRACE) {
    return readExpression(scanner);
  }

  if (code === DOUBLE_QUOTE || code === SINGLE_QUOTE) {
    return readQuotedString(scanner, code);
  }

  throw new JSXSyntaxError('Expected a quoted string or a `{…}` JSON value after `=`', scanner.source, scanner.index);
}

/**
 * Finds the `}` that closes the container — skipping over braces inside JSON strings — and hands
 * the single slice between the braces to `JSON.parse`, which rejects everything that is not JSON.
 */
function readExpression(scanner: Scanner): JsonValue {
  const { source } = scanner;
  const start = scanner.index;
  let index = start + 1;
  let depth = 1;
  let inString = false;

  while (index < source.length) {
    const code = source.charCodeAt(index);

    if (inString) {
      if (code === BACKSLASH) {
        index += 2;
        continue;
      }

      if (code === DOUBLE_QUOTE) {
        inString = false;
      }

      index += 1;
      continue;
    }

    if (code === DOUBLE_QUOTE) {
      inString = true;
    } else if (code === LEFT_BRACE) {
      depth += 1;
    } else if (code === RIGHT_BRACE) {
      depth -= 1;

      if (depth === 0) {
        scanner.index = index + 1;

        return parseJsonValue(source.slice(start + 1, index), source, start);
      }
    }

    index += 1;
  }

  throw new JSXSyntaxError('Unterminated expression', source, start);
}

function parseJsonValue(text: string, source: string, offset: number): JsonValue {
  try {
    const value: JsonValue = JSON.parse(text);

    return value;
  } catch {
    throw new JSXSyntaxError('Expected a single JSON value between `{` and `}`', source, offset);
  }
}

/** Reads a quoted attribute value. Backslashes are not escapes here; only entities are decoded. */
function readQuotedString(scanner: Scanner, quote: number): string {
  const { source } = scanner;
  const start = scanner.index + 1;
  let index = start;
  let sawAmpersand = false;

  while (index < source.length) {
    const code = source.charCodeAt(index);

    if (code === quote) {
      const raw = source.slice(start, index);
      scanner.index = index + 1;

      return sawAmpersand ? decodeEntities(raw) : raw;
    }

    if (code === AMPERSAND) {
      sawAmpersand = true;
    }

    index += 1;
  }

  throw new JSXSyntaxError('Unterminated attribute value', source, scanner.index);
}

/**
 * Reads a run of text up to the next `<` or `{`. The two flags keep the common case to a single
 * `slice`: normalization and entity decoding only run when the run actually contains their triggers.
 */
function readText(scanner: Scanner): string {
  const { source } = scanner;
  const start = scanner.index;
  let index = start;
  let sawAmpersand = false;
  let sawLayout = false;

  while (index < source.length) {
    const code = source.charCodeAt(index);

    if (code === LESS_THAN || code === LEFT_BRACE) {
      break;
    }

    if (code === AMPERSAND) {
      sawAmpersand = true;
    } else if (code === LINE_FEED || code === CARRIAGE_RETURN || code === TAB) {
      sawLayout = true;
    }

    index += 1;
  }

  scanner.index = index;
  const raw = source.slice(start, index);
  const normalized = sawLayout ? normalizeText(raw) : raw;

  return sawAmpersand ? decodeEntities(normalized) : normalized;
}

function readName(scanner: Scanner): string | undefined {
  const { source } = scanner;
  const start = scanner.index;

  if (!isNameStart(source.charCodeAt(start))) {
    return undefined;
  }

  let index = start + 1;

  while (index < source.length && isNamePart(source.charCodeAt(index))) {
    index += 1;
  }

  scanner.index = index;

  return source.slice(start, index);
}

/** Assigns an attribute without letting one named `__proto__` reach the prototype chain. */
function defineAttribute(attributes: JSXAttributes, name: string, value: JsonValue): void {
  if (name === PROTOTYPE_KEY) {
    Object.defineProperty(attributes, PROTOTYPE_KEY, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });

    return;
  }

  attributes[name] = value;
}

function appendText(children: JSXNode[], value: string): void {
  if (value.length === 0) {
    return;
  }

  children.push({ type: 'text', value });
}

function skipWhitespace(scanner: Scanner): void {
  const { source } = scanner;
  let index = scanner.index;

  while (index < source.length && isWhitespace(source.charCodeAt(index))) {
    index += 1;
  }

  scanner.index = index;
}

function expect(scanner: Scanner, code: number, reason: string): void {
  if (peek(scanner) !== code) {
    throw new JSXSyntaxError(reason, scanner.source, scanner.index);
  }

  scanner.index += 1;
}

/** The character code under the cursor, or `NaN` past the end of the source. */
function peek(scanner: Scanner): number {
  return scanner.source.charCodeAt(scanner.index);
}

function isWhitespace(code: number): boolean {
  return code === SPACE || code === TAB || code === LINE_FEED || code === CARRIAGE_RETURN;
}

function isNameStart(code: number): boolean {
  return (
    (code >= LOWERCASE_A && code <= LOWERCASE_Z) ||
    (code >= UPPERCASE_A && code <= UPPERCASE_Z) ||
    code === UNDERSCORE ||
    code === DOLLAR_SIGN
  );
}

function isNamePart(code: number): boolean {
  return (
    isNameStart(code) ||
    (code >= DIGIT_ZERO && code <= DIGIT_NINE) ||
    code === HYPHEN ||
    code === PERIOD ||
    code === COLON
  );
}

function openingTagLabel(node: JSXElement | JSXFragment): string {
  return node.type === 'element' ? `<${node.name}>` : '<>';
}

function closingTagLabel(name: string | undefined): string {
  return name === undefined ? '</>' : `</${name}>`;
}
