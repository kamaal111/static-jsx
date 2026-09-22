const DOLLAR_SIGN = 0x24;

const HYPHEN = 0x2d;

const DIGIT_ZERO = 0x30;

const DIGIT_NINE = 0x39;

const COLON_CHARACTER = ':';

const PERIOD_CHARACTER = '.';

const UPPERCASE_A = 0x41;

const UPPERCASE_Z = 0x5a;

const UNDERSCORE = 0x5f;

const LOWERCASE_A = 0x61;

const LOWERCASE_Z = 0x7a;

const MAX_ASCII_CODE_POINT = 0x7f;

const ZERO_WIDTH_NON_JOINER = 0x200c;

const ZERO_WIDTH_JOINER = 0x200d;

/** The real `IdentifierStart` grammar admits any Unicode `ID_Start` character, not just ASCII letters. */
const UNICODE_NAME_START = /[$_\p{ID_Start}]/u;

/** `ID_Continue` is a superset of `ID_Start` by definition, so this alone covers Unicode letters and digits. */
const UNICODE_NAME_PART = /[$_\p{ID_Continue}]/u;

function isAsciiNameStart(codePoint: number): boolean {
  if (codePoint >= LOWERCASE_A && codePoint <= LOWERCASE_Z) {
    return true;
  }

  if (codePoint >= UPPERCASE_A && codePoint <= UPPERCASE_Z) {
    return true;
  }

  if (codePoint === UNDERSCORE) {
    return true;
  }

  if (codePoint === DOLLAR_SIGN) {
    return true;
  }

  return false;
}

/** Whether a Unicode code point may start an identifier, per JS/JSX's own `IdentifierStart` grammar. */
export function isNameStart(codePoint: number): boolean {
  if (isAsciiNameStart(codePoint)) {
    return true;
  }

  if (codePoint <= MAX_ASCII_CODE_POINT) {
    return false;
  }

  return UNICODE_NAME_START.test(String.fromCodePoint(codePoint));
}

/**
 * Whether a Unicode code point may continue an identifier: everything `isNameStart` allows, plus
 * digits, the zero-width joiner/non-joiner (part of the real `IdentifierPart` grammar, used by some
 * scripts), any other `ID_Continue` character, or `-` (JSX's own extension over JS identifiers).
 */
export function isIdentifierPart(codePoint: number): boolean {
  if (isNameStart(codePoint)) {
    return true;
  }

  if (codePoint >= DIGIT_ZERO && codePoint <= DIGIT_NINE) {
    return true;
  }

  if (codePoint === HYPHEN || codePoint === ZERO_WIDTH_NON_JOINER || codePoint === ZERO_WIDTH_JOINER) {
    return true;
  }

  if (codePoint <= MAX_ASCII_CODE_POINT) {
    return false;
  }

  return UNICODE_NAME_PART.test(String.fromCodePoint(codePoint));
}

/** Whether a whole string is a single identifier segment: no `.` and no `:`. */
function isIdentifier(value: string): boolean {
  if (value.length === 0) {
    return false;
  }

  const characters = Array.from(value);
  const firstCodePoint = characters[0]?.codePointAt(0);

  if (firstCodePoint === undefined || !isNameStart(firstCodePoint)) {
    return false;
  }

  for (let index = 1; index < characters.length; index += 1) {
    const codePoint = characters[index]?.codePointAt(0);

    if (codePoint === undefined || !isIdentifierPart(codePoint)) {
      return false;
    }
  }

  return true;
}

/** Whether a whole string is a dot-chain of two or more identifiers, e.g. `Foo.Bar.Baz`. */
function isMemberExpressionName(value: string): boolean {
  const parts = value.split(PERIOD_CHARACTER);

  if (parts.length < 2) {
    return false;
  }

  return parts.every(isIdentifier);
}

/** Whether a whole string is a single `namespace:name` pair. */
function isNamespacedName(value: string): boolean {
  const separatorIndex = value.indexOf(COLON_CHARACTER);

  if (separatorIndex === -1 || value.indexOf(COLON_CHARACTER, separatorIndex + 1) !== -1) {
    return false;
  }

  const namespace = value.slice(0, separatorIndex);
  const local = value.slice(separatorIndex + 1);

  return isIdentifier(namespace) && isIdentifier(local);
}

/** Whether a whole string could be written as a tag name in the source and read back unchanged. */
export function isElementName(value: string): boolean {
  return isIdentifier(value) || isMemberExpressionName(value) || isNamespacedName(value);
}

/** Whether a whole string could be written as an attribute name in the source and read back unchanged. */
export function isAttributeName(value: string): boolean {
  return isIdentifier(value) || isNamespacedName(value);
}
