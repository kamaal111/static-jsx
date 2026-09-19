const DOLLAR_SIGN = 0x24;

const HYPHEN = 0x2d;

const PERIOD = 0x2e;

const DIGIT_ZERO = 0x30;

const DIGIT_NINE = 0x39;

const COLON = 0x3a;

const UPPERCASE_A = 0x41;

const UPPERCASE_Z = 0x5a;

const UNDERSCORE = 0x5f;

const LOWERCASE_A = 0x61;

const LOWERCASE_Z = 0x7a;

export function isNameStart(code: number): boolean {
  if (code >= LOWERCASE_A && code <= LOWERCASE_Z) {
    return true;
  }

  if (code >= UPPERCASE_A && code <= UPPERCASE_Z) {
    return true;
  }

  if (code === UNDERSCORE) {
    return true;
  }

  if (code === DOLLAR_SIGN) {
    return true;
  }

  return false;
}

export function isNamePart(code: number): boolean {
  if (isNameStart(code)) {
    return true;
  }

  if (code >= DIGIT_ZERO && code <= DIGIT_NINE) {
    return true;
  }

  if (code === HYPHEN) {
    return true;
  }

  if (code === PERIOD) {
    return true;
  }

  if (code === COLON) {
    return true;
  }

  return false;
}

/** Whether a whole string could be written as a name in the source and read back unchanged. */
export function isName(value: string): boolean {
  if (value.length === 0) {
    return false;
  }

  if (!isNameStart(value.charCodeAt(0))) {
    return false;
  }

  for (let index = 1; index < value.length; index += 1) {
    if (!isNamePart(value.charCodeAt(index))) {
      return false;
    }
  }

  return true;
}
