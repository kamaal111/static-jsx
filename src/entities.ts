/**
 * Only the five references that JSX itself needs, plus numeric references. Every other `&name;`
 * is left alone, which keeps text lossless: what the printer writes back is what was read.
 */
const NAMED_REFERENCES = new Map<string, string>([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
]);

const AMPERSAND = '&';

const NUMBER_SIGN = 0x23;

const LOWERCASE_X = 0x78;

const UPPERCASE_X = 0x58;

const MAX_CODE_POINT = 0x10ffff;

const FIRST_SURROGATE = 0xd800;

const LAST_SURROGATE = 0xdfff;

/**
 * Replaces the supported character references in `raw` with the characters they stand for.
 * Anything that is not a reference this package knows is returned untouched.
 */
export function decodeEntities(raw: string): string {
  let ampersand = raw.indexOf(AMPERSAND);

  if (ampersand === -1) {
    return raw;
  }

  let decoded = '';
  let copiedUpTo = 0;

  while (ampersand !== -1) {
    const semicolon = raw.indexOf(';', ampersand + 1);

    if (semicolon === -1) {
      break;
    }

    const replacement = decodeReference(raw.slice(ampersand + 1, semicolon));

    if (replacement !== undefined) {
      decoded += raw.slice(copiedUpTo, ampersand) + replacement;
      copiedUpTo = semicolon + 1;
    }

    ampersand = raw.indexOf(AMPERSAND, ampersand + 1);
  }

  return copiedUpTo === 0 ? raw : decoded + raw.slice(copiedUpTo);
}

/** Escapes the characters that would otherwise change the meaning of a text child. */
export function escapeText(value: string): string {
  return escapeWith(value, textReplacement);
}

/** Escapes the characters that would otherwise end, or reshape, a double-quoted attribute value. */
export function escapeAttribute(value: string): string {
  return escapeWith(value, attributeReplacement);
}

function decodeReference(body: string): string | undefined {
  const named = NAMED_REFERENCES.get(body);

  if (named !== undefined) {
    return named;
  }

  if (body.charCodeAt(0) !== NUMBER_SIGN) {
    return undefined;
  }

  const secondCode = body.charCodeAt(1);
  const hexadecimal = secondCode === LOWERCASE_X || secondCode === UPPERCASE_X;
  const codePoint = parseCodePoint(body.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);

  if (codePoint === undefined) {
    return undefined;
  }

  return String.fromCodePoint(codePoint);
}

/** Like `Number.parseInt`, but rejects anything that is not entirely digits of the given radix. */
function parseCodePoint(digits: string, radix: number): number | undefined {
  if (digits.length === 0) {
    return undefined;
  }

  let codePoint = 0;

  for (const character of digits) {
    const digit = Number.parseInt(character, radix);

    if (Number.isNaN(digit)) {
      return undefined;
    }

    codePoint = codePoint * radix + digit;

    if (codePoint > MAX_CODE_POINT) {
      return undefined;
    }
  }

  if (codePoint >= FIRST_SURROGATE && codePoint <= LAST_SURROGATE) {
    return undefined;
  }

  return codePoint;
}

/**
 * `{` and `}` would open an expression, `<` a tag, and a line break or tab would be eaten by
 * whitespace normalization on the way back in, so each becomes a numeric reference.
 */
function textReplacement(code: number): string | undefined {
  switch (code) {
    case 0x26:
      return '&amp;';
    case 0x3c:
      return '&lt;';
    case 0x3e:
      return '&gt;';
    case 0x7b:
      return '&#123;';
    case 0x7d:
      return '&#125;';
    default:
      return whitespaceReplacement(code);
  }
}

function attributeReplacement(code: number): string | undefined {
  switch (code) {
    case 0x26:
      return '&amp;';
    case 0x22:
      return '&quot;';
    case 0x3c:
      return '&lt;';
    default:
      return whitespaceReplacement(code);
  }
}

function whitespaceReplacement(code: number): string | undefined {
  switch (code) {
    case 0x09:
      return '&#9;';
    case 0x0a:
      return '&#10;';
    case 0x0d:
      return '&#13;';
    default:
      return undefined;
  }
}

function escapeWith(value: string, replacementOf: (code: number) => string | undefined): string {
  let escaped = '';
  let copiedUpTo = 0;

  for (let index = 0; index < value.length; index += 1) {
    const replacement = replacementOf(value.charCodeAt(index));

    if (replacement === undefined) {
      continue;
    }

    escaped += value.slice(copiedUpTo, index) + replacement;
    copiedUpTo = index + 1;
  }

  return copiedUpTo === 0 ? value : escaped + value.slice(copiedUpTo);
}
