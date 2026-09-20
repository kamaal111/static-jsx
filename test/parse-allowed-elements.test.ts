import { syntaxErrorFrom } from './helpers.ts';
import { parse, type ParseOptions } from '../src/parser.ts';

type RuntimeAllowedElements =
  | null
  | readonly never[]
  | Readonly<Record<string, boolean | readonly (number | string)[]>>;

function optionsWithAllowedElements(allowedElements: RuntimeAllowedElements): ParseOptions {
  const options: ParseOptions = {};
  Object.defineProperty(options, 'allowedElements', { enumerable: true, value: allowedElements });

  return options;
}

describe('parse allowedElements', () => {
  it('keeps parsing every valid element and attribute when no schema is given', () => {
    expect(parse('<unknown arbitrary="value" />')).toMatchObject({
      type: 'element',
      name: 'unknown',
      attributes: { arbitrary: 'value' },
    });
  });

  it('accepts listed elements and their listed attributes', () => {
    expect(parse('<card title="Hello" open />', { allowedElements: { card: ['title', 'open'] } })).toMatchObject({
      type: 'element',
      name: 'card',
      attributes: { title: 'Hello', open: true },
    });
  });

  it('rejects an element absent from the schema at its name', () => {
    expect(syntaxErrorFrom('<unknown />', { allowedElements: { card: true } })).toMatchObject({
      message: expect.stringContaining('Element "unknown" is not allowed'),
      offset: 1,
      line: 1,
      column: 2,
    });
  });

  it('allows fragments alongside schema-listed elements', () => {
    expect(() => parse('<><card /></>', { allowedElements: { card: [] } })).not.toThrow();
  });

  it('permits every attribute when an element schema value is true', () => {
    expect(() => parse('<card title="Hello" data-id={1} />', { allowedElements: { card: true } })).not.toThrow();
  });

  it('rejects an attribute absent from an element allowlist at its name', () => {
    expect(syntaxErrorFrom('<card hidden />', { allowedElements: { card: ['title'] } })).toMatchObject({
      message: expect.stringContaining('Attribute "hidden" is not allowed on <card>'),
      offset: 6,
      line: 1,
      column: 7,
    });
  });

  it('rejects every attribute for an element whose list is empty', () => {
    expect(syntaxErrorFrom('<card title="Hello" />', { allowedElements: { card: [] } }).message).toContain(
      'Attribute "title" is not allowed on <card>',
    );
  });

  it('allows duplicated names in an attribute allowlist', () => {
    expect(() => parse('<card title="Hello" />', { allowedElements: { card: ['title', 'title'] } })).not.toThrow();
  });

  it('applies each nested element attribute policy independently', () => {
    expect(() =>
      parse('<page title="Home"><card open /></page>', {
        allowedElements: { page: ['title'], card: ['open'] },
      }),
    ).not.toThrow();
    expect(syntaxErrorFrom('<page open><card /></page>', { allowedElements: { page: [], card: true } }).offset).toBe(6);
  });

  it('matches schema names case-sensitively', () => {
    expect(syntaxErrorFrom('<Card />', { allowedElements: { card: true } }).message).toContain(
      'Element "Card" is not allowed',
    );
  });

  it.each([
    { allowedElements: null, description: 'a null schema' },
    { allowedElements: [], description: 'an array schema' },
    { allowedElements: { 'not valid': true }, description: 'an invalid element name' },
    { allowedElements: { card: false }, description: 'an invalid schema entry' },
    { allowedElements: { card: ['not valid'] }, description: 'an invalid attribute name' },
    { allowedElements: { card: [1] }, description: 'a non-string attribute name' },
  ])('rejects $description with TypeError', ({ allowedElements }) => {
    expect(() => parse('<card />', optionsWithAllowedElements(allowedElements))).toThrow(TypeError);
  });
});
