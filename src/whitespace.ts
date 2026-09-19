const LINE_BREAK = /\r\n|\n|\r/;

const NON_WHITESPACE = /[^ \t]/;

const LEADING_SPACES = /^ +/;

const TRAILING_SPACES = / +$/;

/**
 * Applies JSX's whitespace rules to a raw run of text, so that indentation in the source never
 * becomes content:
 *
 * 1. tabs count as spaces;
 * 2. every line but the first loses its leading spaces, every line but the last its trailing spaces;
 * 3. lines that are left empty are dropped, and the rest are joined with a single space.
 *
 * Returns an empty string for text that is nothing but layout, which the parser then drops entirely.
 * Text that fits on one line is returned unchanged, spaces at either end included.
 */
export function normalizeText(raw: string): string {
  const lines = raw.split(LINE_BREAK);

  let lastNonEmptyLine = 0;

  for (const [index, line] of lines.entries()) {
    if (NON_WHITESPACE.test(line)) {
      lastNonEmptyLine = index;
    }
  }

  let normalized = '';

  for (const [index, line] of lines.entries()) {
    let trimmed = line.replaceAll('\t', ' ');

    if (index !== 0) {
      trimmed = trimmed.replace(LEADING_SPACES, '');
    }

    if (index !== lines.length - 1) {
      trimmed = trimmed.replace(TRAILING_SPACES, '');
    }

    if (trimmed.length === 0) {
      continue;
    }

    normalized += index === lastNonEmptyLine ? trimmed : `${trimmed} `;
  }

  return normalized;
}
