import { decodeEntities } from './entities.ts';
import { JSXLimitError, JSXSyntaxError } from './errors.ts';
import {
  isJsonContainer,
  isUnwritableNumber,
  type MutableJsonContainer,
  type MutableJsonValue,
} from './json-values.ts';
import { isAttributeName, isElementName, isIdentifierPart, isNameStart } from './names.ts';
import {
  JSX_NODE_TYPES,
  type JSXAttributes,
  type JSXElement,
  type JSXFragment,
  type JSXNode,
  type JSXRootNode,
  type JsonValue,
} from './types.ts';
import { normalizeText } from './whitespace.ts';

const TAB = 0x09;

const LINE_FEED = 0x0a;

const CARRIAGE_RETURN = 0x0d;

const SPACE = 0x20;

const DOUBLE_QUOTE = 0x22;

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

const UPPERCASE_E = 0x45;

const BACKSLASH = 0x5c;

const LOWERCASE_E = 0x65;

const LEFT_BRACE = 0x7b;

const RIGHT_BRACE = 0x7d;

const MAX_BMP_CODE_POINT = 0xffff;

/** Digits enough to overflow a double on their own, without an exponent: `1e309` is already `Infinity`. */
const OVERFLOW_DIGITS = 309;

const UNWRITABLE_NUMBER_REASON = 'Number cannot be written back as itself, so it would not survive a round trip';

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

/** Every limit `parse` can enforce. All are unlimited unless given a finite value. */
export interface ParseOptions {
  /**
   * Elements that may appear in the document and, for each, the attributes it may hold. `true`
   * permits every attribute; an array permits only the listed attributes. Defaults to permitting
   * every element and attribute.
   */
  allowedElements?: Readonly<Record<string, true | readonly string[]>>;
  /** Maximum length of the source string. Defaults to unlimited. */
  maxSourceLength?: number;
  /** Maximum nesting depth of elements and fragments; the root is depth 1. Defaults to unlimited. */
  maxDepth?: number;
  /** Maximum number of nodes (elements, fragments, text nodes, expressions) in the tree. Defaults to unlimited. */
  maxNodes?: number;
  /** Maximum number of attributes on a single opening tag. Defaults to unlimited. */
  maxAttributesPerNode?: number;
  /** Maximum number of children on a single element or fragment. Defaults to unlimited. */
  maxChildrenPerNode?: number;
  /** Maximum length of a tag or attribute name. Defaults to unlimited. */
  maxNameLength?: number;
  /**
   * Maximum length of an attribute value's raw source text: a quoted string's contents, or the
   * JSON between `{` and `}`. Defaults to unlimited.
   */
  maxAttributeValueLength?: number;
}

type AllowedAttributes = true | ReadonlySet<string>;

type AllowedElements = ReadonlyMap<string, AllowedAttributes>;

/** Resolved limits plus the running totals `parse` enforces them against. */
type Limits = Readonly<Omit<Required<ParseOptions>, 'allowedElements'>> & {
  readonly allowedElements: AllowedElements | undefined;
  nodeCount: number;
};

function resolveLimits(options: ParseOptions | undefined): Limits {
  return {
    allowedElements: resolveAllowedElements(options?.allowedElements),
    maxSourceLength: options?.maxSourceLength ?? Infinity,
    maxDepth: options?.maxDepth ?? Infinity,
    maxNodes: options?.maxNodes ?? Infinity,
    maxAttributesPerNode: options?.maxAttributesPerNode ?? Infinity,
    maxChildrenPerNode: options?.maxChildrenPerNode ?? Infinity,
    maxNameLength: options?.maxNameLength ?? Infinity,
    maxAttributeValueLength: options?.maxAttributeValueLength ?? Infinity,
    nodeCount: 0,
  };
}

function resolveAllowedElements(value: ParseOptions['allowedElements']): AllowedElements | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || Object(value) !== value || Array.isArray(value) || Function.prototype.isPrototypeOf(value)) {
    throw new TypeError('allowedElements must be a non-null object that is not an array');
  }

  return Object.entries(value).reduce((allowedElements, [elementName, attributes]) => {
    if (!isElementName(elementName)) {
      throw new TypeError(`allowedElements has an invalid element name: ${JSON.stringify(elementName)}`);
    }

    if (attributes === true) {
      return allowedElements.set(elementName, true);
    }

    if (!Array.isArray(attributes)) {
      throw new TypeError(`allowedElements[${JSON.stringify(elementName)}] must be true or an array`);
    }

    const allowedAttributes = attributes.reduce((allowedAttributes, attributeName) => {
      if (
        Object.prototype.toString.call(attributeName) !== '[object String]' ||
        attributeName instanceof String ||
        !isAttributeName(attributeName)
      ) {
        throw new TypeError(`allowedElements[${JSON.stringify(elementName)}] has an invalid attribute name`);
      }

      return allowedAttributes.add(attributeName);
    }, new Set<string>());

    return allowedElements.set(elementName, allowedAttributes);
  }, new Map<string, AllowedAttributes>());
}

/**
 * Parses a static JSX document into a JSON-compatible tree.
 *
 * The document must hold exactly one root element or fragment; whitespace around it is ignored.
 *
 * @throws {JSXSyntaxError} when the source is not valid static JSX.
 * @throws {JSXLimitError} when the source exceeds a limit configured in `options`.
 */
export function parse(source: string, options?: ParseOptions): JSXRootNode {
  const limits = resolveLimits(options);

  if (source.length > limits.maxSourceLength) {
    throw new JSXLimitError('maxSourceLength', limits.maxSourceLength, source.length, source, 0);
  }

  const scanner: Scanner = { source, index: 0 };
  skipWhitespace(scanner);
  const root = parseTree(scanner, limits);
  skipWhitespace(scanner);

  if (scanner.index < source.length) {
    throw new JSXSyntaxError('Unexpected content after the root node', source, scanner.index);
  }

  return root;
}

function countNode(limits: Limits, source: string, offset: number): void {
  limits.nodeCount += 1;

  if (limits.nodeCount > limits.maxNodes) {
    throw new JSXLimitError('maxNodes', limits.maxNodes, limits.nodeCount, source, offset);
  }
}

function countChild(limits: Limits, children: readonly JSXNode[], source: string, offset: number): void {
  const count = children.length + 1;

  if (count > limits.maxChildrenPerNode) {
    throw new JSXLimitError('maxChildrenPerNode', limits.maxChildrenPerNode, count, source, offset);
  }
}

/**
 * Walks the whole document with an explicit stack of open nodes rather than recursion, so that
 * deeply nested input cannot exhaust the call stack.
 */
function parseTree(scanner: Scanner, limits: Limits): JSXRootNode {
  const { source } = scanner;
  const rootStart = scanner.index;

  if (peek(scanner) !== LESS_THAN) {
    throw new JSXSyntaxError('Expected the document to start with an element or a fragment', source, rootStart);
  }

  const first = readTag(scanner, limits);

  if (first.kind === TAG_KINDS.CLOSE) {
    throw new JSXSyntaxError('Unexpected closing tag', source, rootStart);
  }

  if (1 > limits.maxDepth) {
    throw new JSXLimitError('maxDepth', limits.maxDepth, 1, source, rootStart);
  }

  if (first.selfClosing) {
    return first.node;
  }

  let current: OpenNode = { node: first.node, openedAt: rootStart };
  const ancestors: OpenNode[] = [];

  while (scanner.index < source.length) {
    const code = source.charCodeAt(scanner.index);

    if (code === LEFT_BRACE) {
      const exprStart = scanner.index;
      const value = readExpression(scanner, limits);
      countNode(limits, source, exprStart);
      countChild(limits, current.node.children, source, exprStart);
      current.node.children.push({ type: JSX_NODE_TYPES.EXPRESSION, value });
      continue;
    }

    if (code !== LESS_THAN) {
      const textStart = scanner.index;
      appendText(current.node.children, readText(scanner), limits, source, textStart);
      continue;
    }

    const tagStart = scanner.index;
    const tag = readTag(scanner, limits);

    if (tag.kind === TAG_KINDS.OPEN) {
      const depth = ancestors.length + 2;

      if (depth > limits.maxDepth) {
        throw new JSXLimitError('maxDepth', limits.maxDepth, depth, source, tagStart);
      }

      if (tag.selfClosing) {
        countChild(limits, current.node.children, source, tagStart);
        current.node.children.push(tag.node);
      } else {
        ancestors.push(current);
        current = { node: tag.node, openedAt: tagStart };
      }

      continue;
    }

    const expectedName = current.node.type === JSX_NODE_TYPES.ELEMENT ? current.node.name : undefined;

    if (tag.name !== expectedName) {
      const reason = `Expected ${closingTagLabel(expectedName)}, but found ${closingTagLabel(tag.name)}`;
      throw new JSXSyntaxError(reason, source, tagStart);
    }

    const parent = ancestors.pop();

    if (parent === undefined) {
      return current.node;
    }

    countChild(limits, parent.node.children, source, current.openedAt);
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
function readTag(scanner: Scanner, limits: Limits): Tag {
  const tagStart = scanner.index;
  scanner.index += 1;

  if (peek(scanner) === SLASH) {
    scanner.index += 1;
    const name = readTagName(scanner, limits);
    skipWhitespace(scanner);
    expect(scanner, GREATER_THAN, 'Expected `>` to end the closing tag');

    return makeCloseTag({ name });
  }

  const nameStart = scanner.index;
  const name = readTagName(scanner, limits);

  if (name === undefined) {
    scanner.index += 1;
    countNode(limits, scanner.source, tagStart);

    return makeOpenTag({ node: { type: JSX_NODE_TYPES.FRAGMENT, children: [] }, selfClosing: false });
  }

  const allowedAttributes = allowedAttributesForElement(limits, name, scanner.source, nameStart);
  const attributes = readAttributes(scanner, tagStart, limits, name, allowedAttributes);
  const selfClosing = peek(scanner) === SLASH;

  if (selfClosing) {
    scanner.index += 1;
  }

  expect(scanner, GREATER_THAN, 'Expected `>` to end the opening tag');
  countNode(limits, scanner.source, tagStart);

  return makeOpenTag({ node: { type: 'element', name, attributes, children: [] }, selfClosing });
}

function allowedAttributesForElement(
  limits: Limits,
  name: string,
  source: string,
  offset: number,
): AllowedAttributes | undefined {
  if (limits.allowedElements === undefined) {
    return undefined;
  }

  const allowedAttributes = limits.allowedElements.get(name);

  if (allowedAttributes === undefined) {
    throw new JSXSyntaxError(`Element ${JSON.stringify(name)} is not allowed`, source, offset);
  }

  return allowedAttributes;
}

/** Returns `undefined` for a fragment's empty tag, and rejects anything else that is not a name. */
function readTagName(scanner: Scanner, limits: Limits): string | undefined {
  const name = readElementName(scanner, limits);

  if (name === undefined && peek(scanner) !== GREATER_THAN) {
    throw new JSXSyntaxError('Expected a tag name', scanner.source, scanner.index);
  }

  return name;
}

/** Reads attributes until the scanner reaches the `/` or `>` that ends the opening tag. */
function readAttributes(
  scanner: Scanner,
  tagStart: number,
  limits: Limits,
  elementName: string,
  allowedAttributes: AllowedAttributes | undefined,
): JSXAttributes {
  const { source } = scanner;
  const attributes = makeAttributes();
  let attributeCount = 0;

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
    const name = readAttributeName(scanner, limits);

    if (name === undefined) {
      throw new JSXSyntaxError('Expected an attribute name', source, nameStart);
    }

    if (Object.hasOwn(attributes, name)) {
      throw new JSXSyntaxError(`Duplicate attribute "${name}"`, source, nameStart);
    }

    if (allowedAttributes !== undefined && allowedAttributes !== true && !allowedAttributes.has(name)) {
      throw new JSXSyntaxError(
        `Attribute ${JSON.stringify(name)} is not allowed on <${elementName}>`,
        source,
        nameStart,
      );
    }

    attributeCount += 1;

    if (attributeCount > limits.maxAttributesPerNode) {
      throw new JSXLimitError('maxAttributesPerNode', limits.maxAttributesPerNode, attributeCount, source, nameStart);
    }

    attributes[name] = readAttributeValue(scanner, limits);
  }
}

/** A bare attribute is `true`; otherwise the value is a quoted string or a `{…}` JSON value. */
function readAttributeValue(scanner: Scanner, limits: Limits): JsonValue {
  skipWhitespace(scanner);

  if (peek(scanner) !== EQUALS_SIGN) {
    return true;
  }

  scanner.index += 1;
  skipWhitespace(scanner);
  const code = peek(scanner);

  if (code === LEFT_BRACE) {
    return readExpression(scanner, limits);
  }

  if (code === DOUBLE_QUOTE || code === SINGLE_QUOTE) {
    return readQuotedString(scanner, code, limits);
  }

  throw new JSXSyntaxError('Expected a quoted string or a `{…}` JSON value after `=`', scanner.source, scanner.index);
}

/**
 * Finds the `}` that closes the container — skipping over braces inside JSON strings — and hands
 * the single slice between the braces to `JSON.parse`, which rejects everything that is not JSON.
 *
 * The same walk notes whether the slice could hold a number `JSON.stringify` would not write back,
 * so that {@link validateJsonValue} only ever visits the values that could actually need it.
 */
function readExpression(scanner: Scanner, limits: Limits): JsonValue {
  const start = scanner.index;
  let index = start + 1;
  let depth = 1;
  let inString = false;
  let digitRun = 0;
  let mayHoldUnwritableNumber = false;

  while (index < scanner.source.length) {
    const code = scanner.source.charCodeAt(index);

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
        const contentLength = index - start - 1;

        if (contentLength > limits.maxAttributeValueLength) {
          throw new JSXLimitError(
            'maxAttributeValueLength',
            limits.maxAttributeValueLength,
            contentLength,
            scanner.source,
            start,
          );
        }

        scanner.index = index + 1;

        return parseJsonValue(scanner.source.slice(start + 1, index), scanner.source, start, mayHoldUnwritableNumber);
      }
    } else if (afterDigit && (code === LOWERCASE_E || code === UPPERCASE_E)) {
      // an exponent is the short way to overflow to Infinity, and JSON only ever writes one
      // straight after a digit — so the `e` in `true` and `false` is not one
      mayHoldUnwritableNumber = true;
    } else if (code === HYPHEN && scanner.source.charCodeAt(index + 1) === DIGIT_ZERO) {
      // `-0` is the one finite number JSON cannot write back
      mayHoldUnwritableNumber = true;
    }

    index += 1;
  }

  throw new JSXSyntaxError('Unterminated expression', scanner.source, start);
}

function parseJsonValue(text: string, source: string, offset: number, validate: boolean): JsonValue {
  let value: MutableJsonValue;

  try {
    value = JSON.parse(text);
  } catch {
    throw new JSXSyntaxError('Expected a single JSON value between `{` and `}`', source, offset);
  }

  return validate ? validateJsonValue(value, source, offset) : value;
}

/**
 * Keeps the tree's promise that every value it holds survives a JSON round trip. `JSON.stringify`
 * writes `Infinity` and `NaN` as `null` and `-0` as `0`, so all of them are rejected.
 *
 * Nested values are walked with an explicit stack rather than recursion, so that a deeply nested
 * value cannot exhaust the call stack.
 */
function validateJsonValue(value: MutableJsonValue, source: string, offset: number): JsonValue {
  if (!isJsonContainer(value)) {
    if (isUnwritableNumber(value)) {
      throw new JSXSyntaxError(UNWRITABLE_NUMBER_REASON, source, offset);
    }

    return value;
  }

  const containers: MutableJsonContainer[] = [value];

  for (let container = containers.pop(); container !== undefined; container = containers.pop()) {
    Object.values(container).forEach(held => {
      if (isJsonContainer(held)) {
        containers.push(held);

        return;
      }

      if (isUnwritableNumber(held)) {
        throw new JSXSyntaxError(UNWRITABLE_NUMBER_REASON, source, offset);
      }
    });
  }

  return value;
}

/** Reads a quoted attribute value. Backslashes are not escapes here; only entities are decoded. */
function readQuotedString(scanner: Scanner, quote: number, limits: Limits): string {
  const start = scanner.index + 1;
  let index = start;
  let sawAmpersand = false;

  while (index < scanner.source.length) {
    const code = scanner.source.charCodeAt(index);

    if (code === quote) {
      const length = index - start;

      if (length > limits.maxAttributeValueLength) {
        throw new JSXLimitError(
          'maxAttributeValueLength',
          limits.maxAttributeValueLength,
          length,
          scanner.source,
          start,
        );
      }

      const raw = scanner.source.slice(start, index);
      scanner.index = index + 1;

      return sawAmpersand ? decodeEntities(raw) : raw;
    }

    if (code === AMPERSAND) {
      sawAmpersand = true;
    }

    index += 1;
  }

  throw new JSXSyntaxError('Unterminated attribute value', scanner.source, scanner.index);
}

/**
 * Reads a run of text up to the next `<` or `{`. The two flags keep the common case to a single
 * `slice`: normalization and entity decoding only run when the run actually contains their triggers.
 */
function readText(scanner: Scanner): string {
  const start = scanner.index;
  let index = start;
  let sawAmpersand = false;
  let sawLayout = false;

  while (index < scanner.source.length) {
    const code = scanner.source.charCodeAt(index);

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
  const raw = scanner.source.slice(start, index);
  const normalized = sawLayout ? normalizeText(raw) : raw;

  return sawAmpersand ? decodeEntities(normalized) : normalized;
}

/** How many UTF-16 code units a code point takes: 2 for an astral character, 1 for a BMP one. */
function codePointWidth(codePoint: number): number {
  return codePoint > MAX_BMP_CODE_POINT ? 2 : 1;
}

/** Reads one identifier segment: no `.`, no `:`. Walks by Unicode code point, not UTF-16 code unit. */
function readIdentifier(scanner: Scanner): string | undefined {
  const start = scanner.index;
  const startCodePoint = scanner.source.codePointAt(start);

  if (startCodePoint === undefined || !isNameStart(startCodePoint)) {
    return undefined;
  }

  let index = start + codePointWidth(startCodePoint);

  while (index < scanner.source.length) {
    const codePoint = scanner.source.codePointAt(index);

    if (codePoint === undefined || !isIdentifierPart(codePoint)) {
      break;
    }

    index += codePointWidth(codePoint);
  }

  scanner.index = index;

  return scanner.source.slice(start, index);
}

/** Enforces `maxNameLength` over the whole name matched since `start`, segments and separators alike. */
function finishName(scanner: Scanner, limits: Limits, start: number): string {
  const length = scanner.index - start;

  if (length > limits.maxNameLength) {
    throw new JSXLimitError('maxNameLength', limits.maxNameLength, length, scanner.source, start);
  }

  return scanner.source.slice(start, scanner.index);
}

/**
 * A tag name is an identifier, a dot-chain of identifiers (`Foo.Bar.Baz`), or a single
 * `namespace:name` pair — never a mix of `.` and `:`.
 */
function readElementName(scanner: Scanner, limits: Limits): string | undefined {
  const start = scanner.index;

  if (readIdentifier(scanner) === undefined) {
    return undefined;
  }

  if (peek(scanner) === PERIOD) {
    while (peek(scanner) === PERIOD) {
      scanner.index += 1;

      if (readIdentifier(scanner) === undefined) {
        throw new JSXSyntaxError("Expected a name after '.' in a tag name", scanner.source, scanner.index);
      }
    }

    if (peek(scanner) === COLON) {
      throw new JSXSyntaxError("A tag name cannot mix '.' and ':'", scanner.source, scanner.index);
    }
  } else if (peek(scanner) === COLON) {
    scanner.index += 1;

    if (readIdentifier(scanner) === undefined) {
      throw new JSXSyntaxError("Expected a name after ':' in a tag name", scanner.source, scanner.index);
    }

    if (peek(scanner) === COLON) {
      throw new JSXSyntaxError("A tag name cannot hold more than one ':'", scanner.source, scanner.index);
    }

    if (peek(scanner) === PERIOD) {
      throw new JSXSyntaxError("A tag name cannot mix '.' and ':'", scanner.source, scanner.index);
    }
  }

  return finishName(scanner, limits, start);
}

/** An attribute name is an identifier or a single `namespace:name` pair — never a dot. */
function readAttributeName(scanner: Scanner, limits: Limits): string | undefined {
  const start = scanner.index;

  if (readIdentifier(scanner) === undefined) {
    return undefined;
  }

  if (peek(scanner) === COLON) {
    scanner.index += 1;

    if (readIdentifier(scanner) === undefined) {
      throw new JSXSyntaxError("Expected a name after ':' in an attribute name", scanner.source, scanner.index);
    }

    if (peek(scanner) === COLON) {
      throw new JSXSyntaxError("An attribute name cannot hold more than one ':'", scanner.source, scanner.index);
    }
  }

  if (peek(scanner) === PERIOD) {
    throw new JSXSyntaxError("An attribute name cannot hold '.'", scanner.source, scanner.index);
  }

  return finishName(scanner, limits, start);
}

/**
 * Attributes are named by the document, so the object holding them must inherit nothing: with no
 * prototype, `'toString' in attributes` answers about the document rather than about `Object`, and
 * an attribute named `__proto__` is an ordinary own property with no setter to dodge.
 */
function makeAttributes(): JSXAttributes {
  return Object.create(null);
}

function appendText(children: JSXNode[], value: string, limits: Limits, source: string, offset: number): void {
  if (value.length === 0) {
    return;
  }

  countNode(limits, source, offset);
  countChild(limits, children, source, offset);
  children.push({ type: JSX_NODE_TYPES.TEXT, value });
}

function skipWhitespace(scanner: Scanner): void {
  let index = scanner.index;

  while (index < scanner.source.length && isWhitespace(scanner.source.charCodeAt(index))) {
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
  return node.type === JSX_NODE_TYPES.ELEMENT ? `<${node.name}>` : '<>';
}

function closingTagLabel(name: string | undefined): string {
  return name === undefined ? '</>' : `</${name}>`;
}
