import { asElement, element, text } from './helpers.ts';
import { parse } from '../src/parser.ts';
import { stringify } from '../src/stringify.ts';

const HIGH = '\ud800';

const LOW = '\udc00';

const EMOJI = '\u{1f600}';

function throughUtf8(value: string): string {
  return new TextDecoder().decode(new TextEncoder().encode(value));
}

describe('an unpaired surrogate in text', () => {
  it('is written as a numeric reference instead of literally', () => {
    expect(stringify(element('p', {}, [text(HIGH)]))).toBe('<p>&#55296;</p>');
  });

  it('is written that way when it is a low surrogate with nothing before it', () => {
    expect(stringify(element('p', {}, [text(LOW)]))).toBe('<p>&#56320;</p>');
  });

  it('leaves the printed document well-formed, so a file can hold it', () => {
    const printed = stringify(element('p', {}, [text(HIGH)]));

    expect(printed.isWellFormed()).toBe(true);
    expect(throughUtf8(printed)).toBe(printed);
  });

  it('comes back as the same code unit when parsed again', () => {
    const tree = element('p', {}, [text(HIGH)]);

    expect(parse(stringify(tree))).toEqual(tree);
  });

  it('survives the trip through a UTF-8 file', () => {
    const tree = element('p', {}, [text(`before ${HIGH} after`)]);

    expect(parse(throughUtf8(stringify(tree)))).toEqual(tree);
  });

  it('is still escaped when a pair sits right next to it', () => {
    expect(stringify(element('p', {}, [text(`${EMOJI}${HIGH}`)]))).toBe(`<p>${EMOJI}&#55296;</p>`);
  });
});

describe('an unpaired surrogate in an attribute', () => {
  it('is written as a numeric reference instead of literally', () => {
    expect(stringify(element('a', { t: HIGH }))).toBe('<a t="&#55296;" />');
  });

  it('comes back as the same code unit when parsed again', () => {
    const tree = element('a', { t: HIGH });

    expect(parse(throughUtf8(stringify(tree)))).toEqual(tree);
  });

  it('is what a lone surrogate written straight into the source becomes', () => {
    expect(asElement(parse(`<a t="${HIGH}" />`)).attributes.t).toBe(HIGH);
  });
});

describe('a surrogate that is half of a pair', () => {
  it('stays literal in text, so an emoji is still readable', () => {
    expect(stringify(element('p', {}, [text(`hi ${EMOJI}`)]))).toBe(`<p>hi ${EMOJI}</p>`);
  });

  it('stays literal in an attribute', () => {
    expect(stringify(element('a', { t: EMOJI }))).toBe(`<a t="${EMOJI}" />`);
  });

  it('round-trips as the character it spells', () => {
    const tree = element('p', {}, [text(EMOJI)]);

    expect(parse(throughUtf8(stringify(tree)))).toEqual(tree);
  });
});

describe('a surrogate written into the source as a numeric reference', () => {
  it('decodes in text', () => {
    expect(parse('<p>&#55296;</p>')).toEqual(element('p', {}, [text(HIGH)]));
  });

  it('decodes in an attribute', () => {
    expect(asElement(parse('<a t="&#xD800;" />')).attributes.t).toBe(HIGH);
  });

  it('decodes a hexadecimal pair into the character it spells', () => {
    expect(asElement(parse('<a t="&#xD83D;&#xDE00;" />')).attributes.t).toBe(EMOJI);
  });

  it('is still refused above the Unicode range', () => {
    expect(parse('<p>&#1114112;</p>')).toEqual(element('p', {}, [text('&#1114112;')]));
  });
});
