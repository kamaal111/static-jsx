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

## API

### `parse(source: string, options?: ParseOptions): JSXRootNode`

Parses a document holding exactly one root element or fragment. Whitespace around the root is
ignored. Throws a `JSXSyntaxError` for anything else.

`options` can restrict the document grammar and bound how much a single call will parse, for
untrusted input. Every restriction and limit is optional; omitted options accept every valid element
name and attribute and impose no limit.

`allowedElements` is a complete element schema. Its keys are the only permitted element names. A
value of `true` permits every attribute on that element; an array permits only the listed attributes
(including no attributes for `[]`). Fragments are always permitted.

```ts
parse('<card title="Hello" open />', {
  allowedElements: { card: ['title', 'open'] },
});

parse('<section anything="goes" />', {
  allowedElements: { section: true },
});
```

| Option                    | Bounds                                                                 |
| ------------------------- | ---------------------------------------------------------------------- |
| `allowedElements`         | allowed element names and their allowed attributes                     |
| `maxSourceLength`         | the length of `source`                                                 |
| `maxDepth`                | nesting depth of elements and fragments; the root is depth 1           |
| `maxNodes`                | total nodes in the tree — elements, fragments, text and expressions    |
| `maxAttributesPerNode`    | attributes on a single opening tag                                     |
| `maxChildrenPerNode`      | children on a single element or fragment                               |
| `maxNameLength`           | length of a tag or attribute name, including any `.` or `:` separators |
| `maxAttributeValueLength` | length of a quoted string's contents, or the JSON between `{` and `}`  |

A disallowed element or attribute throws `JSXSyntaxError` at its name. `allowedElements` is also
validated at runtime: it must be a non-null object (not an array), keys and listed attributes must
be valid names, and each value must be `true` or an array of strings. Invalid option values throw
`TypeError`.

Exceeding any of them throws a `JSXLimitError` instead of building the rest of the tree:

```
Exceeded maxDepth (2); found 3 (1:7)

1 | <a><b><c /></b></a>
  |       ^
```

### `stringify(node: JSXRootNode, options?: StringifyOptions): string`

Prints an element or a fragment back to JSX — the same two shapes `parse` returns, so whatever comes
out can always be read back in. `options.indent` is the string one level of nesting is indented with,
two spaces by default, and may hold only spaces, tabs and line breaks.

Throws a `JSXStringifyError` rather than print something that would not read back. That can only
happen for a tree assembled by hand: a value JSON cannot write (`Infinity`, `-Infinity`, `NaN`), a
name that is not a name, an empty text node or two text nodes in a row, or an indent holding anything
else. See [Round-tripping](#round-tripping).

### Errors

`JSXSyntaxError`, `JSXLimitError` and `JSXStringifyError` all extend `StaticJSXError`, so every
error this package throws can be caught as one group. Both `JSXSyntaxError` and `JSXLimitError`
carry `offset`, `line`, `column` and a ready-to-print `frame`:

```
Expected a quoted string or a `{…}` JSON value after `=` (2:10)

2 |   <a foo=bar />
  |          ^
```

A `JSXLimitError` additionally carries `limit` (which `ParseOptions` field was exceeded, typed as the
exported `JSXLimit`),
`limitValue` (what it was set to) and `actualValue` (what the source held instead), so a caller can
tell a limit violation apart from malformed input and react to it — e.g. reject the request as too
large instead of reporting it as a bad document.

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
Two of those names are exported in their own right: `JSXAttributes` is the type of an `attributes`
object, and `JsonValue` is any value a JSON round trip preserves — a string, number, boolean, `null`,
or an array or object of those.

The `attributes` object has **no prototype**, so a name only ever answers for itself. `Object.keys`,
`Object.entries`, spread and `JSON.stringify` behave exactly as they would on an ordinary object, but
nothing is inherited, so looking a name up can never find something `Object` put there:

```ts
const { attributes } = parse('<a title="Hi" />'); // element
Object.getPrototypeOf(attributes); // null
'toString' in attributes; // false
```

That matters as soon as an attribute name comes from a variable rather than from source you wrote,
which is exactly what searching a document does.

## Searching the tree

`parse` gives back inert JSON: a node knows nothing about where it sits. Searching therefore hands you
a **cursor** — a node together with the way down to it — rather than a bare node, so a result can be
navigated upwards. Cursors are built by the traversal and thrown away with it; nothing is ever written
to the tree.

```ts
interface JSXCursor<Node extends JSXNode = JSXNode> {
  readonly node: Node;
  readonly parent: JSXCursor | undefined;
  readonly index: number;
  readonly depth: number;
}

type JSXMatcher = (cursor: JSXCursor) => boolean;
```

| Field    | What it holds                                                   |
| -------- | --------------------------------------------------------------- |
| `node`   | the node this cursor is at                                      |
| `parent` | the cursor for the node holding it, or `undefined` at the root  |
| `index`  | this node's place among its parent's children; `-1` at the root |
| `depth`  | how many nodes stand between it and the root; `0` at the root   |

The type parameter is what lets a search narrow its result: `JSXCursor<JSXElement>` is a cursor known
to be at an element, so `.node.name` and `.node.attributes` can be read without a check.

```ts
import { find, findAll, walk } from '@kamaalio/static-jsx';

const tree = parse('<ul><li id="a">First</li><li id="b">Second</li></ul>');

for (const cursor of walk(tree)) {
  console.log(cursor.depth, cursor.node.type);
}
```

A **matcher** is just a predicate over a cursor, which is all `JSXMatcher` says, so most of what you
want to ask is a one-liner:

```ts
const isListItem = cursor => cursor.node.type === 'element' && cursor.node.name === 'li';

find(tree, isListItem); // the first match, or undefined
Array.from(findAll(tree, isListItem)); // every match
```

`walk` and `findAll` are lazy generators, and `find` stops at the first hit rather than walking the
rest. All of them take either a whole document or a cursor, so searches compose: `find(found, …)`
searches that subtree while the result's `parent` chain still reaches the document root.

Write a matcher as a type guard and the result is typed as an element, with no cast:

```ts
const isListItem = (cursor: JSXCursor): cursor is JSXCursor<JSXElement> =>
  cursor.node.type === 'element' && cursor.node.name === 'li';

find(tree, isListItem)?.node.name; // string
```

| Export                | What it does                                                         |
| --------------------- | -------------------------------------------------------------------- |
| `walk(from)`          | every node from here down, in document order, lazily                 |
| `find(from, m)`       | the first match, or `undefined`; stops walking at the hit            |
| `findAll(from, m)`    | every match, in document order, lazily                               |
| `closest(cursor, m)`  | the nearest cursor at or above this one that matches, like the DOM's |
| `childrenOf(cursor)`  | a cursor per child, in order                                         |
| `ancestorsOf(cursor)` | every cursor above this one, from the root down                      |
| `isElementCursor(c)`  | narrows a cursor to one at an element                                |

There is no text-extraction helper. What counts as a node's text is a decision only you can make —
whether a `{…}` expression contributes its value or nothing at all — so write the few lines that suit
your own documents:

```ts
let text = '';

for (const cursor of walk(node)) {
  if (cursor.node.type === 'text') {
    text += cursor.node.value;
  }
}
```

### Asking about structure

The four combinators turn a matcher into a matcher that asks about a node's surroundings. Each takes
one matcher and returns one, so they compose with any predicate you write. Sharing one document and
one helper:

```ts
import { findAll, withAncestor, withChild, withDescendant, withParent } from '@kamaalio/static-jsx';

const named = name => cursor => cursor.node.type === 'element' && cursor.node.name === name;

const doc = parse(`
  <page>
    <ul>
      <li>One</li>
      <><li>Two</li></>
    </ul>
    <section><h1>Intro</h1><p>Body</p></section>
    <section><p>No heading</p></section>
  </page>
`);
```

**`withParent(m)`** — the node's parent matches. This is the CSS `A > B` combinator, written as
"`B`, and its parent is `A`":

```ts
Array.from(findAll(doc, cursor => named('li')(cursor) && withParent(named('ul'))(cursor)));
// both list items: One, Two
```

**`withAncestor(m)`** — some node above it matches, however far up. This is the CSS `A B`
combinator:

```ts
Array.from(findAll(doc, cursor => named('p')(cursor) && withAncestor(named('section'))(cursor)));
// both paragraphs: Body, No heading
```

**`withChild(m)`** — some node directly inside it matches. Useful for "only the ones that have a
…":

```ts
Array.from(findAll(doc, cursor => named('section')(cursor) && withChild(named('h1'))(cursor)));
// only the first section -- the second has no heading
```

**`withDescendant(m)`** — something somewhere inside it matches:

```ts
Array.from(findAll(doc, cursor => named('page')(cursor) && withDescendant(named('h1'))(cursor)));
// the page, because a heading exists somewhere below it
```

| Export              | True when                                                       |
| ------------------- | --------------------------------------------------------------- |
| `withParent(m)`     | the node's effective parent matches — the `A > B` combinator    |
| `withAncestor(m)`   | any ancestor matches, fragments included — the `A B` combinator |
| `withChild(m)`      | any effective child matches                                     |
| `withDescendant(m)` | any descendant matches, fragments included                      |

### Why not just read `cursor.parent`?

Because a fragment would break it. In the document above, the second `<li>` is wrapped in a `<>…</>`
that someone added for formatting, and reading the parent directly cannot see past it:

```ts
const parentIsUl = cursor => cursor.parent?.node.type === 'element' && cursor.parent.node.name === 'ul';

Array.from(findAll(doc, cursor => named('li')(cursor) && parentIsUl(cursor)));
// only One -- Two is missed, because its parent is the fragment

Array.from(findAll(doc, cursor => named('li')(cursor) && withParent(named('ul'))(cursor)));
// One and Two
```

That is the whole reason these exist: `withParent` and `withChild` treat a `<>…</>` as the children it
holds, so a wrapper cannot silently change what a query finds. `withAncestor` and `withDescendant`
have no such subtlety — they simply walk up or down — and you could write them yourself over
`ancestorsOf` and `walk` in a line or two.

Precisely:

- a node's _effective parent_ is its nearest ancestor that is not a fragment, and it has none when every
  ancestor up to the root is a fragment — so under a fragment root, `withParent` is never true;
- a node's _effective children_ are its children with each fragment replaced, in place and in order, by
  that fragment's own effective children;
- `withParent` and `withChild` use those, so **a fragment is never anyone's parent or child**:
  `withParent(isFragment)` can never be true, and `withAncestor(isFragment)` is how to ask instead;
- `withAncestor` and `withDescendant` test every ancestor or descendant, fragments included — a fragment
  does not count as _structure_, but it is still a node a matcher may ask about;
- a fragment is still asked about in its own right, so in `<ul><><li /></></ul>` both the fragment and
  the `<li>` match `withParent(named('ul'))`: the fragment does literally sit inside the `<ul>`. Spell
  the combinator as "`B`, and its parent is `A`" — as every example above does — and that never
  surprises you.

`withDescendant` walks a subtree per candidate, so searching a whole document with it costs a pass per
node rather than a single pass.

Nothing here recurses. `walk` and the combinators use explicit stacks just as `parse` and `stringify`
do, so the "nesting has no ceiling" guarantee holds for searching too.

There is no selector-string language. Every matcher is a plain function of a cursor, so one could be
compiled onto these later — `A > B` is `B` and `withParent(A)`, `A B` is `B` and `withAncestor(A)` —
with nothing here having to change.

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

Names follow JSX's own identifier grammar. A plain identifier starts with a Unicode `ID_Start`
character (or `_`/`$`) and continues with `ID_Continue` characters, digits, `-`, or the zero-width
joiner/non-joiner — so `café`, `日本語` and `aria-label` are all identifiers, but a name may not start
with a digit or a character (such as an emoji) that is not `ID_Start`. A tag name may also be a dotted
chain of identifiers (`Foo.Bar.Baz`, a `JSXMemberExpression`) or a single namespaced pair (`ns:name`, a
`JSXNamespacedName`), but never both at once — `a.b:c` and `a:b.c` are both rejected, exactly as in
JSX. An attribute name may be a plain identifier or a single namespaced pair, but never a dotted
chain: `<a x.y="1" />` is rejected, even though `<a.y />` as a tag name is not. An attribute written
twice is an error rather than a silent overwrite. An attribute named `__proto__` is an ordinary own
property, because the object holding it has no prototype to replace.

Only `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;` and numeric references such as `&#38;` or `&#x26;`
are decoded. Every other `&name;` is left exactly as written, so nothing is lost in either direction.
A numeric reference may name a surrogate code unit, which is how the printer writes an unpaired one.

A `>` inside text is ordinary text, as it is in JSX.

Every value in the tree is one that survives a JSON round trip, which the parser enforces rather than
discovers later. A number too large for a double — `{1e400}`, or 309 digits with no exponent at all —
is a syntax error, because `JSON.stringify` writes it back as `null` and a number would silently
become something else. `-0` is a syntax error for the same reason: `JSON.stringify` writes it as `0`,
so the sign would be lost on the way out. A number that is merely rounded to the nearest double is
kept, because the rounded value is what writes back.

Duplicate keys inside a `{…}` JSON value are resolved by `JSON.parse`, so the last one wins. This is
unlike a duplicate attribute, which is an error.

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
`JSON.parse(JSON.stringify(tree))` is likewise equal to `tree` in every value it holds — the same keys,
in the same order, with the same values. The one thing JSON cannot carry is the missing prototype on
`attributes`, so the revived object inherits from `Object` again: structural comparison still holds,
while `util.isDeepStrictEqual`, which compares prototypes, does not. A tree assembled by hand may use
an ordinary object for `attributes`; `stringify` does not care. The printed document is always
well-formed UTF-16, so writing it to a file or sending it over the wire cannot change it: an unpaired
surrogate is written as a numeric reference, while a surrogate pair stays literal so astral characters
like emoji remain readable.

Every tree `parse` returns satisfies all three. A tree assembled by hand has to be one `parse` could
have produced, which means:

- every value is one a JSON round trip preserves, so no `Infinity`, `-Infinity`, `NaN` or `-0`;
- every element name satisfies the tag-name grammar and every attribute name satisfies the
  (narrower) attribute-name grammar, per the rules above;
- no text node is empty, since printing one leaves nothing behind to read;
- no two text nodes are adjacent, since printing them leaves nothing to tell them apart and they
  come back as one;
- the indent holds only spaces, tabs and line breaks.

`stringify` throws a `JSXStringifyError` for each of those rather than print something that would
read back as a different tree.

Nesting has no ceiling by default. `parse` and `stringify` walk the tree, and the values inside it,
with explicit stacks, and Node 22 walks JSON iteratively as well, so all three guarantees hold however
deep a document goes — a `maxDepth` in `ParseOptions` only ever adds a chosen bound on top of that, it
is never needed to keep the call stack safe. A value that refers to itself is the one thing
`JSON.stringify` will not write, and that is reported as a `JSXStringifyError` rather than left to
escape as a `TypeError`.

## Development

Commands live in the `justfile`:

```sh
just         # list every recipe
just ready   # format check, lint, type-check and the test suite
just test    # tests with coverage
just fuzz    # the property tests on a random seed, 20 000 runs each
just bench   # the benchmarks above
```

The suite pairs example tests, which are the readable specification, with property tests built on
[fast-check](https://github.com/dubzzz/fast-check). The properties assert the round-trip guarantee
over generated trees and every accepted indent, that `parse` answers arbitrary, truncated and mutated
input with a tree or a `JSXSyntaxError` and never anything else, that `stringify` either refuses a
tree or prints one that reads back equal, that a walk yields every node exactly once in document order
and that each cursor it yields resolves back to its own node and inverts its parent's children, and the
algebraic laws underneath: escaping is undone by
decoding, whitespace normalization is idempotent, and `isElementName`/`isAttributeName` each accept
exactly the names the parser reads back in their respective position. `just test` runs them on a fixed
seed so the gate is reproducible; `just fuzz` widens the search.

The `Fuzz` job in CI runs the properties on a new random seed on every push, so a counterexample
shows up while the change is still in front of someone rather than after it lands. The seed that
found it is printed in the job log: pass it back to `fc.assert` to reproduce the case, and pin the
shrunk value as an example test before fixing the cause. `just fuzz 200000` searches wider when a
change deserves it.

Every pull request is benchmarked against the commit it targets. The `Benchmark` workflow runs both
revisions on the same runner, three passes each and interleaved, and posts a table of the result as
a comment. It never fails the build: a change that costs performance is a trade-off to weigh while
reviewing, not something CI should decide on its own. A case whose two sample ranges overlap is
shown as `—`, because at that point the runner moved more than the code did.

## License

MIT
