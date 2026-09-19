import { decodeEntities } from './entities.ts';
import { JSXSyntaxError } from './errors.ts';
import {
  isJsonContainer,
  isUnwritableNumber,
  type MutableJsonContainer,
  type MutableJsonValue,
} from './json-values.ts';
import { isNamePart, isNameStart } from './names.ts';
import type { JSXAttributes, JSXElement, JSXFragment, JSXNode, JSXRootNode, JsonValue } from './types.ts';
import { normalizeText } from './whitespace.ts';

const TAB = 0x09;

const LINE_FEED = 0x0a;

const CARRIAGE_RETURN = 0x0d;

const SPACE = 0x20;

const DOUBLE_QUOTE = 0x22;

const AMPERSAND = 0x26;

const SINGLE_QUOTE = 0x27;

const HYPHEN = 0x2d;

const SLASH = 0x2f;

const DIGIT_ZERO = 0x30;

const DIGIT_NINE = 0x39;

const LESS_THAN = 0x3c;

const EQUALS_SIGN = 0x3d;

const GREATER_THAN = 0x3e;

const UPPERCASE_E = 0x45;

const BACKSLASH = 0x5c;

const LOWERCASE_E = 0x65;

const LEFT_BRACE = 0x7b;

const RIGHT_BRACE = 0x7d;

const PROTOTYPE_KEY = '__proto__';

/** Digits enough to overflow a double on their own, without an exponent: `1e309` is already `Infinity`. */
const OVERFLOW_DIGITS = 309;

const UNWRITABLE_NUMBER_REASON = 'Number is too large to be written back, so it would not survive a round trip';

const TAG_KINDS = { OPEN: 'open', CLOSE: 'close' } as const;

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

interface OpenTag {
  readonly kind: typeof TAG_KINDS.OPEN;
  readonly node: JSXElement | JSXFragment;
  readonly selfClosing: boolean;
}

interface CloseTag {
  readonly kind: typeof TAG_KINDS.CLOSE;
  readonly name: string | undefined;
}

type Tag = OpenTag | CloseTag;

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

  if (first.kind === TAG_KINDS.CLOSE) {
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

    if (tag.kind === TAG_KINDS.OPEN) {
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

function makeCloseTag(opts: Omit<CloseTag, 'kind'>): CloseTag {
  return { kind: TAG_KINDS.CLOSE, name: opts.name };
}

function makeOpenTag(opts: Omit<OpenTag, 'kind'>): OpenTag {
  return { kind: TAG_KINDS.OPEN, node: opts.node, selfClosing: opts.selfClosing };
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

    return makeCloseTag({ name });
  }

  const name = readTagName(scanner);

  if (name === undefined) {
    scanner.index += 1;

    return makeOpenTag({ node: { type: 'fragment', children: [] }, selfClosing: false });
  }

  const attributes = readAttributes(scanner, tagStart);
  const selfClosing = peek(scanner) === SLASH;

  if (selfClosing) {
    scanner.index += 1;
  }

  expect(scanner, GREATER_THAN, 'Expected `>` to end the opening tag');

  return makeOpenTag({ node: { type: 'element', name, attributes, children: [] }, selfClosing });
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
 *
 * The same walk notes whether the slice could hold a number `JSON.stringify` would not write back,
 * so that {@link normalizeJsonValue} only ever visits the values that could actually need it.
 */
function readExpression(scanner: Scanner): JsonValue {
  const { source } = scanner;
  const start = scanner.index;
  let index = start + 1;
  let depth = 1;
  let inString = false;
  let digitRun = 0;
  let mayHoldUnwritableNumber = false;

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

    if (code >= DIGIT_ZERO && code <= DIGIT_NINE) {
      digitRun += 1;

      if (digitRun >= OVERFLOW_DIGITS) {
        mayHoldUnwritableNumber = true;
      }

      index += 1;
      continue;
    }

    const afterDigit = digitRun > 0;
    digitRun = 0;

    if (code === DOUBLE_QUOTE) {
      inString = true;
    } else if (code === LEFT_BRACE) {
      depth += 1;
    } else if (code === RIGHT_BRACE) {
      depth -= 1;

      if (depth === 0) {
        scanner.index = index + 1;

        return parseJsonValue(source.slice(start + 1, index), source, start, mayHoldUnwritableNumber);
      }
    } else if (afterDigit && (code === LOWERCASE_E || code === UPPERCASE_E)) {
      // an exponent is the short way to overflow to Infinity, and JSON only ever writes one
      // straight after a digit — so the `e` in `true` and `false` is not one
      mayHoldUnwritableNumber = true;
    } else if (code === HYPHEN && source.charCodeAt(index + 1) === DIGIT_ZERO) {
      // `-0` is the one finite number JSON cannot write back
      mayHoldUnwritableNumber = true;
    }

    index += 1;
  }

  throw new JSXSyntaxError('Unterminated expression', source, start);
}

function parseJsonValue(text: string, source: string, offset: number, validate: boolean): JsonValue {
  let value: MutableJsonValue;

  try {
    value = JSON.parse(text);
  } catch {
    throw new JSXSyntaxError('Expected a single JSON value between `{` and `}`', source, offset);
  }

  return validate ? normalizeJsonValue(value, source, offset) : value;
}

/**
 * Keeps the tree's promise that every value it holds survives a JSON round trip. `JSON.stringify`
 * writes `Infinity` and `NaN` as `null`, which would change the value's very type, so those are
 * rejected; it writes `-0` as `0`, so a negative zero is normalized here rather than changing
 * silently on the way out.
 *
 * Nested values are walked with an explicit stack rather than recursion, so that a deeply nested
 * value cannot exhaust the call stack.
 */
function normalizeJsonValue(value: MutableJsonValue, source: string, offset: number): JsonValue {
  if (!isJsonContainer(value)) {
    if (isUnwritableNumber(value)) {
      throw new JSXSyntaxError(UNWRITABLE_NUMBER_REASON, source, offset);
    }

    return Object.is(value, -0) ? 0 : value;
  }

  const containers: MutableJsonContainer[] = [value];

  for (let container = containers.pop(); container !== undefined; container = containers.pop()) {
    for (const [key, held] of Object.entries(container)) {
      if (isJsonContainer(held)) {
        containers.push(held);
        continue;
      }

      if (isUnwritableNumber(held)) {
        throw new JSXSyntaxError(UNWRITABLE_NUMBER_REASON, source, offset);
      }

      if (!Object.is(held, -0)) {
        continue;
      }

      if (Array.isArray(container)) {
        container[Number(key)] = 0;
        continue;
      }

      container[key] = 0;
    }
  }

  return value;
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

function openingTagLabel(node: JSXElement | JSXFragment): string {
  return node.type === 'element' ? `<${node.name}>` : '<>';
}

function closingTagLabel(name: string | undefined): string {
  return name === undefined ? '</>' : `</${name}>`;
}
