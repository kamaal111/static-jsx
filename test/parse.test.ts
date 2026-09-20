import { asElement, element, expression, fragment, text } from './helpers.ts';
import { parse } from '../src/parser.ts';

describe('parse', () => {
  describe('elements', () => {
    it('reads a self-closing element as an element with no children', () => {
      expect(parse('<card />')).toEqual(element('card'));
    });

    it('reads an element written with a closing tag', () => {
      expect(parse('<card></card>')).toEqual(element('card'));
    });

    it('nests children in the order they appear', () => {
      expect(parse('<row><a /><b /></row>')).toEqual(element('row', {}, [element('a'), element('b')]));
    });

    it('nests elements to any depth', () => {
      expect(parse('<a><b><c /></b></a>')).toEqual(element('a', {}, [element('b', {}, [element('c')])]));
    });

    it('accepts a plain identifier built from letters, digits, dashes, underscores and dollars', () => {
      expect(parse('<$_A-b1 />')).toEqual(element('$_A-b1'));
    });

    it('accepts a dotted member-expression tag name', () => {
      expect(parse('<Foo.Bar.Baz />')).toEqual(element('Foo.Bar.Baz'));
    });

    it('accepts a namespaced tag name', () => {
      expect(parse('<ns:name />')).toEqual(element('ns:name'));
    });

    it('accepts a namespaced closing tag name', () => {
      expect(parse('<ns:name></ns:name>')).toEqual(element('ns:name'));
    });

    it('accepts a dotted closing tag name', () => {
      expect(parse('<Foo.Bar></Foo.Bar>')).toEqual(element('Foo.Bar'));
    });

    it('accepts a tag name holding non-ASCII Unicode letters', () => {
      expect(parse('<café />')).toEqual(element('café'));
      expect(parse('<日本語 />')).toEqual(element('日本語'));
    });

    it('accepts a tag name holding an astral-plane letter', () => {
      expect(parse('<𝔉oo />')).toEqual(element('𝔉oo'));
    });

    it('ignores whitespace around the root', () => {
      expect(parse('\n\t <card />\r\n ')).toEqual(element('card'));
    });
  });

  describe('fragments', () => {
    it('reads a fragment as the root node', () => {
      expect(parse('<><a /><b /></>')).toEqual(fragment([element('a'), element('b')]));
    });

    it('reads an empty fragment', () => {
      expect(parse('<></>')).toEqual(fragment());
    });

    it('reads a fragment nested inside an element', () => {
      expect(parse('<a><><b /></></a>')).toEqual(element('a', {}, [fragment([element('b')])]));
    });
  });

  describe('attributes', () => {
    it('reads a namespaced attribute name', () => {
      expect(parse('<a ns:name="1" />')).toEqual(element('a', { 'ns:name': '1' }));
    });

    it('reads an attribute name holding non-ASCII Unicode letters', () => {
      expect(parse('<a 日本語="1" />')).toEqual(element('a', { 日本語: '1' }));
    });

    it('reads a double-quoted value as a string', () => {
      expect(parse('<a title="Hello" />')).toEqual(element('a', { title: 'Hello' }));
    });

    it('reads a single-quoted value as a string', () => {
      expect(parse("<a title='Hello' />")).toEqual(element('a', { title: 'Hello' }));
    });

    it('reads an attribute with no value as true', () => {
      expect(parse('<a open />')).toEqual(element('a', { open: true }));
    });

    it('reads a braced number', () => {
      expect(parse('<a count={3} />')).toEqual(element('a', { count: 3 }));
    });

    it('reads a braced boolean', () => {
      expect(parse('<a ready={false} />')).toEqual(element('a', { ready: false }));
    });

    it('reads a braced null', () => {
      expect(parse('<a missing={null} />')).toEqual(element('a', { missing: null }));
    });

    it('reads a braced array', () => {
      expect(parse('<a tags={["one", "two"]} />')).toEqual(element('a', { tags: ['one', 'two'] }));
    });

    it('reads a braced object', () => {
      expect(parse('<a meta={{"id": 1}} />')).toEqual(element('a', { meta: { id: 1 } }));
    });

    it('reads a braced string, escapes and all', () => {
      expect(parse('<a note={"say \\"hi\\""} />')).toEqual(element('a', { note: 'say "hi"' }));
    });

    it('keeps attributes in the order they were written', () => {
      expect(Object.keys(asElement(parse('<a z="1" m="2" a="3" />')).attributes)).toEqual(['z', 'm', 'a']);
    });

    it('allows whitespace around the equals sign', () => {
      expect(parse('<a title = "Hello" />')).toEqual(element('a', { title: 'Hello' }));
    });

    it('decodes character references in a quoted value', () => {
      expect(parse('<a title="1 &lt; 2" />')).toEqual(element('a', { title: '1 < 2' }));
    });

    it('keeps a line break inside a quoted value, which is content rather than layout', () => {
      expect(
        parse(`<a title="one
two" />`),
      ).toEqual(
        element('a', {
          title: `one
two`,
        }),
      );
    });

    it('stores an attribute named __proto__ as an ordinary own property', () => {
      const { attributes } = asElement(parse('<a __proto__="polluted" />'));

      expect(Object.getOwnPropertyDescriptor(attributes, '__proto__')?.value).toBe('polluted');
    });

    it('gives the attributes object no prototype, so an inherited name is never mistaken for an attribute', () => {
      const { attributes } = asElement(parse('<a __proto__="polluted" />'));

      expect(Object.getPrototypeOf(attributes)).toBe(null);
    });

    it('answers `in` for an Object.prototype member with false unless the document wrote it', () => {
      const { attributes } = asElement(parse('<a title="Hi" />'));

      expect('toString' in attributes).toBe(false);
    });
  });

  describe('text', () => {
    it('reads a run of text as a text child', () => {
      expect(parse('<p>hello</p>')).toEqual(element('p', {}, [text('hello')]));
    });

    it('drops the indentation that only lays out the children', () => {
      expect(
        parse(`<row>
  <a />
  <b />
</row>`),
      ).toEqual(element('row', {}, [element('a'), element('b')]));
    });

    it('keeps the space between text and the element that follows it', () => {
      expect(parse('<p>before <b /></p>')).toEqual(element('p', {}, [text('before '), element('b')]));
    });

    it('joins a sentence wrapped over several lines with single spaces', () => {
      expect(
        parse(`<p>
  one
  two
</p>`),
      ).toEqual(element('p', {}, [text('one two')]));
    });

    it('treats a carriage return as a line break', () => {
      expect(parse('<p>one\rtwo</p>')).toEqual(element('p', {}, [text('one two')]));
    });

    it('decodes character references in text', () => {
      expect(parse('<p>1 &lt; 2 &amp; 3</p>')).toEqual(element('p', {}, [text('1 < 2 & 3')]));
    });

    it('reads a greater-than sign as ordinary text, as JSX does', () => {
      expect(parse('<p>a > b</p>')).toEqual(element('p', {}, [text('a > b')]));
    });

    it('keeps a nested element and drops only the layout around it', () => {
      expect(
        parse(`<label>
  Hello <strong>world</strong>
</label>`),
      ).toEqual(element('label', {}, [text('Hello '), element('strong', {}, [text('world')])]));
    });
  });

  describe('expressions', () => {
    it('reads a braced JSON value as an expression child', () => {
      expect(parse('<a>{42}</a>')).toEqual(element('a', {}, [expression(42)]));
    });

    it('reads several expression children in order', () => {
      expect(parse('<a>{1}{"two"}</a>')).toEqual(element('a', {}, [expression(1), expression('two')]));
    });

    it('reads a nested JSON object, whose braces do not end the expression', () => {
      expect(parse('<a>{{"nested": {"deep": true}}}</a>')).toEqual(
        element('a', {}, [expression({ nested: { deep: true } })]),
      );
    });

    it('ignores a brace that sits inside a JSON string', () => {
      expect(parse('<a>{"}"}</a>')).toEqual(element('a', {}, [expression('}')]));
    });

    it('ignores a quote that a backslash escapes inside a JSON string', () => {
      expect(parse('<a>{"a \\" }"}</a>')).toEqual(element('a', {}, [expression('a " }')]));
    });
  });
});
