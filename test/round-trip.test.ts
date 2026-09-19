import { parse } from '../src/parser.ts';
import { stringify } from '../src/stringify.ts';

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
  'text wrapped over several lines': `<p>
  one
  two
</p>`,
  'text around an element': '<p>before <b>bold</b> after</p>',
  'text holding markup characters': '<p>a &amp; b &lt; c &#123;d&#125;</p>',
  'text holding a line break': '<p>one&#10;two</p>',
  'expression children': '<a>{1}{"two"}{[3]}</a>',
  'an expression holding a brace inside a string': '<a>{"}"}</a>',
  'a text child next to an expression child': '<a>{1} and {2}</a>',
  'a deep tree with mixed children': `<page title="Docs">
  <h1>Hello <em>world</em></h1>
  <ul>
    <li>{1}</li>
    <li>{2}</li>
  </ul>
</page>`,
  'an element with text and a nested element split over several lines': `<label>
  Hello <strong>world</strong>
</label>`,
  'an unpaired surrogate in text': '<p>&#55296;</p>',
  'an unpaired surrogate in an attribute': '<a t="&#xD800;" />',
  'an emoji, which is a surrogate pair': '<p>hi \u{1f600}</p>',
  'a negative number': '<a n={-1.5} />',
  'the largest number a double can hold': '<a n={1.7976931348623157e308} />',
  'the smallest number a double can hold': '<a n={5e-324} />',
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
