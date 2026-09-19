import { normalizeText } from '../src/whitespace.ts';

describe('normalizeText', () => {
  it('returns single-line text unchanged', () => {
    expect(normalizeText('hello there')).toBe('hello there');
  });

  it('keeps the spaces at both ends of single-line text, because they sit between real content', () => {
    expect(normalizeText(' hello ')).toBe(' hello ');
  });

  it('counts a tab as a space', () => {
    expect(normalizeText('hello\tthere')).toBe('hello there');
  });

  it('drops the indentation that follows a line break', () => {
    expect(normalizeText('\n    one\n    two\n')).toBe('one two');
  });

  it('collapses the whitespace around a line break into exactly one space', () => {
    expect(normalizeText('one   \n   two')).toBe('one two');
  });

  it('keeps the leading spaces of the first line, which are not indentation', () => {
    expect(normalizeText('  one\n  two')).toBe('  one two');
  });

  it('adds no trailing space after the last line that has content', () => {
    expect(normalizeText('one\n   ')).toBe('one');
  });

  it('returns an empty string for text that is nothing but layout', () => {
    expect(normalizeText('\n   \n\t\n')).toBe('');
  });

  it('treats a carriage return and line feed pair as one line break', () => {
    expect(normalizeText('one\r\ntwo')).toBe('one two');
  });

  it('treats a lone carriage return as a line break', () => {
    expect(normalizeText('one\rtwo')).toBe('one two');
  });
});
