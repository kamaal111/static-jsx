import { element, expression, fragment, text } from './helpers.ts';
import { stringify } from '../src/stringify.ts';

describe('stringify', () => {
  describe('elements', () => {
    it('prints an element with no children as self-closing', () => {
      expect(stringify(element('card'))).toBe('<card />');
    });

    it('prints an empty fragment with both of its tags', () => {
      expect(stringify(fragment())).toBe('<></>');
    });

    it('puts each child element on its own indented line', () => {
      expect(stringify(element('row', {}, [element('a'), element('b')]))).toBe(`<row>
  <a />
  <b />
</row>`);
    });

    it('indents one level deeper per level of nesting', () => {
      expect(stringify(element('a', {}, [element('b', {}, [element('c')])]))).toBe(`<a>
  <b>
    <c />
  </b>
</a>`);
    });

    it('indents a fragment’s children like an element’s', () => {
      expect(stringify(fragment([element('a')]))).toBe(`<>
  <a />
</>`);
    });
  });

  describe('attributes', () => {
    it('prints a string attribute in double quotes', () => {
      expect(stringify(element('a', { title: 'Hello' }))).toBe('<a title="Hello" />');
    });

    it('prints an attribute that is exactly true without a value', () => {
      expect(stringify(element('a', { open: true }))).toBe('<a open />');
    });

    it('prints a number attribute in braces', () => {
      expect(stringify(element('a', { count: 3 }))).toBe('<a count={3} />');
    });

    it('prints a false attribute in braces, because a bare name would mean true', () => {
      expect(stringify(element('a', { ready: false }))).toBe('<a ready={false} />');
    });

    it('prints a null attribute in braces', () => {
      expect(stringify(element('a', { missing: null }))).toBe('<a missing={null} />');
    });

    it('prints an array attribute as JSON in braces', () => {
      expect(stringify(element('a', { tags: ['x', 'y'] }))).toBe('<a tags={["x","y"]} />');
    });

    it('prints an object attribute as JSON in braces', () => {
      expect(stringify(element('a', { meta: { id: 1 } }))).toBe('<a meta={{"id":1}} />');
    });

    it('prints attributes in the order the object holds them', () => {
      expect(stringify(element('a', { z: '1', m: '2' }))).toBe('<a z="1" m="2" />');
    });

    it('escapes a double quote in a string attribute so it cannot end the value', () => {
      expect(stringify(element('a', { title: 'say "hi"' }))).toBe('<a title="say &quot;hi&quot;" />');
    });
  });

  describe('text', () => {
    it('prints a node that has a text child on one line', () => {
      expect(stringify(element('p', {}, [text('hello')]))).toBe('<p>hello</p>');
    });

    it('keeps the spaces at the ends of text by never breaking the line around it', () => {
      expect(stringify(element('p', {}, [text(' spaced ')]))).toBe('<p> spaced </p>');
    });

    it('prints an element between two runs of text inline, spaces intact', () => {
      const paragraph = element('p', {}, [text('before '), element('b', {}, [text('bold')]), text(' after')]);

      expect(stringify(paragraph)).toBe('<p>before <b>bold</b> after</p>');
    });

    it('escapes the characters in text that would otherwise be markup', () => {
      expect(stringify(element('p', {}, [text('a & b < {c}')]))).toBe('<p>a &amp; b &lt; &#123;c&#125;</p>');
    });

    it('prints a text node on its own', () => {
      expect(stringify(text('hello'))).toBe('hello');
    });
  });

  describe('expressions', () => {
    it('prints an expression child as JSON in braces', () => {
      expect(stringify(element('a', {}, [expression(42)]))).toBe(`<a>
  {42}
</a>`);
    });

    it('puts each expression child on its own line, since none of them is text', () => {
      expect(stringify(element('a', {}, [expression(1), expression('two')]))).toBe(`<a>
  {1}
  {"two"}
</a>`);
    });

    it('prints an expression node on its own', () => {
      expect(stringify(expression([1, 2]))).toBe('{[1,2]}');
    });
  });

  describe('indent option', () => {
    it('indents with two spaces by default', () => {
      expect(stringify(element('a', {}, [element('b')]))).toBe(`<a>
  <b />
</a>`);
    });

    it('indents with the given string', () => {
      expect(stringify(element('a', {}, [element('b')]), { indent: '    ' })).toBe(`<a>
    <b />
</a>`);
    });

    it('indents with a tab when asked to', () => {
      expect(stringify(element('a', {}, [element('b')]), { indent: '\t' })).toBe(`<a>
\t<b />
</a>`);
    });
  });
});
