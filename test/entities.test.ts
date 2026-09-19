import { decodeEntities, escapeAttribute, escapeText } from '../src/entities.ts';

describe('decodeEntities', () => {
  it.each([
    ['&amp;', '&'],
    ['&lt;', '<'],
    ['&gt;', '>'],
    ['&quot;', '"'],
    ['&apos;', "'"],
  ])('decodes %s to %s', (reference, character) => {
    expect(decodeEntities(reference)).toBe(character);
  });

  it('decodes a decimal character reference', () => {
    expect(decodeEntities('&#65;')).toBe('A');
  });

  it('decodes a lowercase hexadecimal character reference', () => {
    expect(decodeEntities('&#x41;')).toBe('A');
  });

  it('decodes an uppercase hexadecimal character reference', () => {
    expect(decodeEntities('&#X41;')).toBe('A');
  });

  it('decodes a character reference outside the basic multilingual plane', () => {
    expect(decodeEntities('&#x1f600;')).toBe('\u{1f600}');
  });

  it('decodes every reference in a string, keeping the text between them', () => {
    expect(decodeEntities('&lt;tag&gt; &amp; more')).toBe('<tag> & more');
  });

  it('returns the string untouched when it holds no ampersand', () => {
    expect(decodeEntities('nothing to decode')).toBe('nothing to decode');
  });

  it('leaves a named reference this package does not support alone', () => {
    expect(decodeEntities('&nbsp;')).toBe('&nbsp;');
  });

  it('leaves an ampersand that never reaches a semicolon alone', () => {
    expect(decodeEntities('salt & pepper')).toBe('salt & pepper');
  });

  it('still finds a reference that begins inside a failed one', () => {
    expect(decodeEntities('&unknown&amp;')).toBe('&unknown&');
  });

  it('leaves a numeric reference holding a non-digit alone', () => {
    expect(decodeEntities('&#4a;')).toBe('&#4a;');
  });

  it('leaves a reference with no digits alone', () => {
    expect(decodeEntities('&#x;')).toBe('&#x;');
  });

  it('leaves an empty reference alone', () => {
    expect(decodeEntities('&;')).toBe('&;');
  });

  it('leaves a code point above the Unicode range alone', () => {
    expect(decodeEntities('&#1114112;')).toBe('&#1114112;');
  });

  it('leaves a lone surrogate alone, because it cannot stand on its own in a string', () => {
    expect(decodeEntities('&#xD800;')).toBe('&#xD800;');
  });
});

describe('escapeText', () => {
  it('escapes an ampersand so it cannot begin a reference', () => {
    expect(escapeText('salt & pepper')).toBe('salt &amp; pepper');
  });

  it('escapes the angle brackets that would otherwise begin a tag', () => {
    expect(escapeText('<a>')).toBe('&lt;a&gt;');
  });

  it('escapes the braces that would otherwise open an expression', () => {
    expect(escapeText('{ }')).toBe('&#123; &#125;');
  });

  it('escapes a line break, which whitespace normalization would otherwise swallow', () => {
    expect(escapeText('one\ntwo')).toBe('one&#10;two');
  });

  it('escapes a carriage return', () => {
    expect(escapeText('one\rtwo')).toBe('one&#13;two');
  });

  it('escapes a tab, which whitespace normalization would otherwise turn into a space', () => {
    expect(escapeText('one\ttwo')).toBe('one&#9;two');
  });

  it('returns text holding nothing special untouched', () => {
    expect(escapeText("plain text with 'quotes'")).toBe("plain text with 'quotes'");
  });

  it('is undone exactly by decodeEntities', () => {
    const value = 'a & b < c > d {e} f\ng';

    expect(decodeEntities(escapeText(value))).toBe(value);
  });
});

describe('escapeAttribute', () => {
  it('escapes the double quote that would end the value', () => {
    expect(escapeAttribute('he said "hi"')).toBe('he said &quot;hi&quot;');
  });

  it('escapes an ampersand so it cannot begin a reference', () => {
    expect(escapeAttribute('this & that')).toBe('this &amp; that');
  });

  it('escapes a less-than sign', () => {
    expect(escapeAttribute('a < b')).toBe('a &lt; b');
  });

  it('escapes a line break so the value stays on one line', () => {
    expect(escapeAttribute('one\ntwo')).toBe('one&#10;two');
  });

  it('leaves single quotes and braces alone, because they are harmless inside double quotes', () => {
    expect(escapeAttribute("it's {here}")).toBe("it's {here}");
  });

  it('is undone exactly by decodeEntities', () => {
    const value = 'a & b < "c"\td';

    expect(decodeEntities(escapeAttribute(value))).toBe(value);
  });
});
