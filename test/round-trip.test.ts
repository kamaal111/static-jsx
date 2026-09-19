import { parse } from '../src/parser.ts';
import { stringify } from '../src/stringify.ts';

/**
 * One source per shape that the round-trip could plausibly break on. Each one is run against the
 * three guarantees below, so a regression names both the guarantee and the shape that broke it.
 */
const SOURCES = {
  'a self-closing element': '<card />',
  'nested elements': '<a><b><c /></b></a>',
  'a fragment root': '<><a /><b /></>',
  'an empty fragment': '<></>',
  'a nested fragment': '<a><><b /></></a>',
  'an attribute of every JSON type':
    '<card title="Hi" count={3} ready={false} missing={null} tags={["a"]} meta={{"id":1}} open />',
  'an attribute value needing escapes': '<a title="he said &quot;hi&quot; &amp; left" />',
  'an attribute value holding a line break': '<a title="one&#10;two" />',
  'text only': '<p>hello</p>',
  'text with spaces at both ends': '<p> spaced </p>',
  'text wrapped over several lines': '<p>\n  one\n  two\n</p>',
  'text around an element': '<p>before <b>bold</b> after</p>',
  'text holding markup characters': '<p>a &amp; b &lt; c &#123;d&#125;</p>',
  'text holding a line break': '<p>one&#10;two</p>',
  'expression children': '<a>{1}{"two"}{[3]}</a>',
  'an expression holding a brace inside a string': '<a>{"}"}</a>',
  'a text child next to an expression child': '<a>{1} and {2}</a>',
  'a deep tree with mixed children':
    '<page title="Docs">\n  <h1>Hello <em>world</em></h1>\n  <ul>\n    <li>{1}</li>\n    <li>{2}</li>\n  </ul>\n</page>',
  'an element with text and a nested element split over several lines':
    '<label>\n  Hello <strong>world</strong>\n</label>',
};

describe.each(Object.entries(SOURCES))('round-tripping %s', (_label, source) => {
  it('parses back to the same tree after being printed', () => {
    const tree = parse(source);

    expect(parse(stringify(tree))).toEqual(tree);
  });

  it('prints to the same string after being parsed again', () => {
    const printed = stringify(parse(source));

    expect(stringify(parse(printed))).toBe(printed);
  });

  it('is unchanged by a trip through JSON', () => {
    const tree = parse(source);

    expect(JSON.parse(JSON.stringify(tree))).toEqual(tree);
  });
});
