import type { ParseOptions } from './parser.ts';

/** Base class for every error this package throws, so consumers can catch them as a group. */
export class StaticJSXError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Thrown when a tree cannot be written as JSX that would parse back to an equal tree, either
 * because it holds a value JSON cannot represent or because a name, text node or option would not
 * survive the trip.
 */
export class JSXStringifyError extends StaticJSXError {}

/** Base for an error located at a specific point in a source string, with a line, column and frame. */
abstract class LocatedError extends StaticJSXError {
  /** Zero-based index into the source string where the problem was found. */
  readonly offset: number;
  /** One-based line number of {@link offset}. */
  readonly line: number;
  /** One-based column number of {@link offset}. */
  readonly column: number;
  /** The offending line with a caret underneath, ready to print. */
  readonly frame: string;

  protected constructor(reason: string, source: string, offset: number) {
    const location = locate(source, offset);
    const frame = codeFrame(location);
    super(`${reason} (${location.line}:${location.column})\n\n${frame}`);
    this.offset = location.offset;
    this.line = location.line;
    this.column = location.column;
    this.frame = frame;
  }
}

/** Thrown when a source string is not valid static JSX. */
export class JSXSyntaxError extends LocatedError {
  constructor(reason: string, source: string, offset: number) {
    super(reason, source, offset);
  }
}

/** Which `ParseOptions` limit a {@link JSXLimitError} reports. */
export type JSXLimit = keyof ParseOptions;

/** Thrown when `parse` is given source that exceeds one of its configured `ParseOptions` limits. */
export class JSXLimitError extends LocatedError {
  /** Which limit was exceeded. */
  readonly limit: JSXLimit;
  /** The configured limit that was exceeded. */
  readonly limitValue: number;
  /** The actual value that exceeded {@link limitValue}. */
  readonly actualValue: number;

  constructor(limit: JSXLimit, limitValue: number, actualValue: number, source: string, offset: number) {
    super(`Exceeded ${limit} (${limitValue}); found ${actualValue}`, source, offset);
    this.limit = limit;
    this.limitValue = limitValue;
    this.actualValue = actualValue;
  }
}

interface SourceLocation {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
  readonly lineText: string;
}

const LINE_FEED = 0x0a;

const CARRIAGE_RETURN = 0x0d;

/** Walks the source once to turn a byte offset into a human-facing line, column and line of text. */
function locate(source: string, offset: number): SourceLocation {
  const clamped = Math.min(Math.max(offset, 0), source.length);
  let line = 1;
  let lineStart = 0;

  for (let index = 0; index < clamped; index += 1) {
    if (endsLineAt(source, index)) {
      line += 1;
      lineStart = index + 1;
    }
  }

  let lineEnd = clamped;

  while (lineEnd < source.length && !isLineBreak(source.charCodeAt(lineEnd))) {
    lineEnd += 1;
  }

  return { offset: clamped, line, column: clamped - lineStart + 1, lineText: source.slice(lineStart, lineEnd) };
}

function isLineBreak(code: number): boolean {
  return code === LINE_FEED || code === CARRIAGE_RETURN;
}

function endsLineAt(source: string, index: number): boolean {
  const code = source.charCodeAt(index);

  if (code === LINE_FEED) {
    return true;
  }

  return code === CARRIAGE_RETURN && source.charCodeAt(index + 1) !== LINE_FEED;
}

function codeFrame(location: SourceLocation): string {
  const gutter = String(location.line);

  return `${gutter} | ${location.lineText}\n${' '.repeat(gutter.length)} | ${' '.repeat(location.column - 1)}^`;
}
