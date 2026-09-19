# static-jsx

Parse static JSX into a plain, JSON-compatible JavaScript object, and print that object back to JSX.

This is not React. There are no components, identifiers, function calls or spreads — the only
dynamic values are JSON literals. What you get back is data you can store, diff, send over the wire
and hand to `JSON.stringify` without losing anything.

```ts
import { parse, stringify } from '@kamaalio/static-jsx';

const tree = parse('<card title="Hello" count={3} open>Some text</card>');
// {
//   type: 'element',
//   name: 'card',
//   attributes: { title: 'Hello', count: 3, open: true },
//   children: [{ type: 'text', value: 'Some text' }],
// }

stringify(tree); // '<card title="Hello" count={3} open>Some text</card>'
```

## Install

```sh
pnpm add @kamaalio/static-jsx
```

Node.js 26 or newer. ESM only, no runtime dependencies.

## API

### `parse(source: string): JSXRootNode`

Parses a document holding exactly one root element or fragment. Whitespace around the root is
ignored. Throws a `JSXSyntaxError` for anything else.

### `stringify(node: JSXNode, options?: StringifyOptions): string`

Prints a node back to JSX. `options.indent` is the string one level of nesting is indented with, two
spaces by default.

### Errors

`JSXSyntaxError` extends `StaticJSXError`, so every error this package throws can be caught as one
group. A syntax error carries `offset`, `line`, `column` and a ready-to-print `frame`:

```
Expected a quoted string or a `{…}` JSON value after `=` (2:10)

2 |   <a foo=bar />
  |          ^
```

## The tree

```ts
type JSXNode = JSXElement | JSXFragment | JSXText | JSXExpression;

interface JSXElement {
  type: 'element';
  name: string;
  attributes: Record<string, JsonValue>;
  children: JSXNode[];
}

interface JSXFragment {
  type: 'fragment';
  children: JSXNode[];
}

interface JSXText {
  type: 'text';
  value: string;
}

interface JSXExpression {
  type: 'expression';
  value: JsonValue;
}
```

`attributes` and `children` are always present, so the JSON shape never changes with the content.

## What the grammar accepts

| Written as                                     | Becomes                                    |
| ---------------------------------------------- | ------------------------------------------ |
| `<card />`, `<card></card>`                    | an element with no children                |
| `<>…</>`                                       | a fragment, at the root or anywhere inside |
| `title="Hi"`, `title='Hi'`                     | the string `'Hi'`                          |
| `open`                                         | `true`                                     |
| `count={3}`, `tags={["a"]}`, `meta={{"id":1}}` | the JSON value inside the braces           |
| `{42}` as a child                              | an expression node holding `42`            |
| `a &amp; b`                                    | the text `a & b`                           |

Attribute and tag names may hold letters, digits, `-`, `.`, `:`, `_` and `$`, and must not start
with a digit. An attribute written twice is an error rather than a silent overwrite, and an
attribute named `__proto__` is stored as an ordinary own property.

Only `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;` and numeric references such as `&#38;` or `&#x26;`
are decoded. Every other `&name;` is left exactly as written, so nothing is lost in either direction.

A `>` inside text is ordinary text, as it is in JSX.

## Whitespace

Text follows JSX's own rules, so indentation never becomes content: tabs count as spaces, each line
but the first loses its leading spaces and each line but the last its trailing spaces, empty lines
are dropped, and what remains is joined with single spaces. Text that was only layout disappears.

```ts
parse('<p>\n  one\n  two\n</p>'); // children: [{ type: 'text', value: 'one two' }]
```

Because of that, the printer puts children on their own indented lines only when none of them is
text. A node with any text child is printed on one line, so that inserted line breaks cannot eat the
text's own leading and trailing spaces.

## Round-tripping

Both directions settle immediately and then never move again:

```ts
parse(stringify(tree)); // deep-equals tree
stringify(parse(printed)); // exactly equals printed
```

The first pass through `stringify` normalizes formatting; every pass after that is a fixed point.
`JSON.parse(JSON.stringify(tree))` is likewise equal to `tree`.

## Performance

A single-pass scanner over the source string, driven by character codes, with no regular expressions
in the hot path and no tokenizer array in between. Text and attribute runs become one `slice`, and
the passes that cost something — whitespace normalization, entity decoding — run only when the run
actually holds a line break, a tab or an ampersand. Both `parse` and `stringify` use an explicit
stack rather than recursion, so nesting cannot exhaust the call stack.

`just bench` on Node 26, Apple silicon:

```
parse  small element         2,785,889 ops/s     135.5 MB/s
parse  2000 list items           1,118 ops/s     105.2 MB/s
parse  1000 levels deep         13,967 ops/s      93.3 MB/s
print  2000 list items           1,270 ops/s     119.6 MB/s
```

## Development

Commands live in the `justfile`:

```sh
just         # list every recipe
just ready   # format check, lint, type-check and the test suite
just test    # tests with coverage
just bench   # the benchmarks above
```

## License

MIT
