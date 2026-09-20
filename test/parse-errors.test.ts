import { syntaxErrorFrom } from './helpers.ts';
import { JSXSyntaxError, StaticJSXError } from '../src/errors.ts';
import { parse } from '../src/parser.ts';

describe('parse', () => {
  describe('rejects a malformed document', () => {
    it('rejects an empty source', () => {
      expect(syntaxErrorFrom('')).toMatchObject({
        message: expect.stringContaining('Expected the document to start with an element or a fragment'),
        line: 1,
        column: 1,
      });
    });

    it('rejects a document that begins with text', () => {
      expect(syntaxErrorFrom('hello')).toMatchObject({
        message: expect.stringContaining('Expected the document to start with an element or a fragment'),
        line: 1,
        column: 1,
      });
    });

    it('rejects a document that begins with a closing tag', () => {
      expect(syntaxErrorFrom('</a>')).toMatchObject({
        message: expect.stringContaining('Unexpected closing tag'),
        line: 1,
        column: 1,
      });
    });

    it('rejects a second root node', () => {
      expect(syntaxErrorFrom('<a /><b />')).toMatchObject({
        message: expect.stringContaining('Unexpected content after the root node'),
        line: 1,
        column: 6,
      });
    });

    it('rejects text after the root node', () => {
      expect(syntaxErrorFrom('<a /> trailing')).toMatchObject({
        message: expect.stringContaining('Unexpected content after the root node'),
        line: 1,
        column: 7,
      });
    });
  });

  describe('rejects a malformed tag', () => {
    it('rejects a tag name that starts with a digit', () => {
      expect(syntaxErrorFrom('<1 />')).toMatchObject({
        message: expect.stringContaining('Expected a tag name'),
        line: 1,
        column: 2,
      });
    });

    it('rejects an opening tag that the source ends in the middle of', () => {
      expect(syntaxErrorFrom('<a ')).toMatchObject({
        message: expect.stringContaining('Unterminated opening tag'),
        line: 1,
        column: 1,
      });
    });

    it('rejects a slash that is not followed by the end of the tag', () => {
      expect(syntaxErrorFrom('<a /b>')).toMatchObject({
        message: expect.stringContaining('Expected `>` to end the opening tag'),
        line: 1,
        column: 5,
      });
    });

    it('rejects a closing tag that is never ended', () => {
      expect(syntaxErrorFrom('<a></a')).toMatchObject({
        message: expect.stringContaining('Expected `>` to end the closing tag'),
        line: 1,
        column: 7,
      });
    });

    it('rejects a closing tag with no name', () => {
      expect(syntaxErrorFrom('<a></ >')).toMatchObject({
        message: expect.stringContaining('Expected a tag name'),
        line: 1,
        column: 6,
      });
    });

    it('rejects an element that is never closed', () => {
      expect(syntaxErrorFrom('<a>')).toMatchObject({
        message: expect.stringContaining('Expected a closing tag for <a>'),
        line: 1,
        column: 1,
      });
    });

    it('rejects a fragment that is never closed', () => {
      expect(syntaxErrorFrom('<>')).toMatchObject({
        message: expect.stringContaining('Expected a closing tag for <>'),
        line: 1,
        column: 1,
      });
    });

    it('rejects a closing tag naming a different element', () => {
      expect(syntaxErrorFrom('<a></b>')).toMatchObject({
        message: expect.stringContaining('Expected </a>, but found </b>'),
        line: 1,
        column: 4,
      });
    });

    it('rejects an element closed as if it were a fragment', () => {
      expect(syntaxErrorFrom('<a></>')).toMatchObject({
        message: expect.stringContaining('Expected </a>, but found </>'),
        line: 1,
        column: 4,
      });
    });

    it('rejects a fragment closed as if it were an element', () => {
      expect(syntaxErrorFrom('<></a>')).toMatchObject({
        message: expect.stringContaining('Expected </>, but found </a>'),
        line: 1,
        column: 3,
      });
    });
  });

  describe('rejects a malformed tag name', () => {
    it('rejects a tag name ending in a dot', () => {
      expect(syntaxErrorFrom('<a. />')).toMatchObject({
        message: expect.stringContaining("Expected a name after '.' in a tag name"),
        line: 1,
        column: 4,
      });
    });

    it('rejects a tag name ending in a colon', () => {
      expect(syntaxErrorFrom('<a: />')).toMatchObject({
        message: expect.stringContaining("Expected a name after ':' in a tag name"),
        line: 1,
        column: 4,
      });
    });

    it('rejects a tag name with two dots in a row', () => {
      expect(syntaxErrorFrom('<a..b />')).toMatchObject({
        message: expect.stringContaining("Expected a name after '.' in a tag name"),
        line: 1,
        column: 4,
      });
    });

    it('rejects a tag name mixing a dot then a colon', () => {
      expect(syntaxErrorFrom('<a.b:c />')).toMatchObject({
        message: expect.stringContaining("A tag name cannot mix '.' and ':'"),
        line: 1,
        column: 5,
      });
    });

    it('rejects a tag name mixing a colon then a dot', () => {
      expect(syntaxErrorFrom('<a:b.c />')).toMatchObject({
        message: expect.stringContaining("A tag name cannot mix '.' and ':'"),
        line: 1,
        column: 5,
      });
    });

    it('rejects a tag name with two colons', () => {
      expect(syntaxErrorFrom('<a:b:c />')).toMatchObject({
        message: expect.stringContaining("A tag name cannot hold more than one ':'"),
        line: 1,
        column: 5,
      });
    });

    it('rejects a tag name that starts with an emoji, which is not a Unicode ID_Start character', () => {
      expect(syntaxErrorFrom('<😀 />')).toMatchObject({
        message: expect.stringContaining('Expected a tag name'),
        line: 1,
        column: 2,
      });
    });
  });

  describe('rejects a malformed attribute', () => {
    it('rejects a value with no attribute name', () => {
      expect(syntaxErrorFrom('<a ="x" />')).toMatchObject({
        message: expect.stringContaining('Expected an attribute name'),
        line: 1,
        column: 4,
      });
    });

    it('rejects the same attribute written twice', () => {
      expect(syntaxErrorFrom('<a b="1" b="2" />')).toMatchObject({
        message: expect.stringContaining('Duplicate attribute "b"'),
        line: 1,
        column: 10,
      });
    });

    it('rejects an unquoted value', () => {
      expect(syntaxErrorFrom('<a b=c />')).toMatchObject({
        message: expect.stringContaining('Expected a quoted string or a `{…}` JSON value after `=`'),
        line: 1,
        column: 6,
      });
    });

    it('rejects a quoted value that is never closed', () => {
      expect(syntaxErrorFrom('<a b="x />')).toMatchObject({
        message: expect.stringContaining('Unterminated attribute value'),
        line: 1,
        column: 6,
      });
    });

    it('rejects a dot in an attribute name', () => {
      expect(syntaxErrorFrom('<a a.b />')).toMatchObject({
        message: expect.stringContaining("An attribute name cannot hold '.'"),
        line: 1,
        column: 5,
      });
    });

    it('rejects an attribute name ending in a colon', () => {
      expect(syntaxErrorFrom('<a a: />')).toMatchObject({
        message: expect.stringContaining("Expected a name after ':' in an attribute name"),
        line: 1,
        column: 6,
      });
    });

    it('rejects an attribute name with two colons', () => {
      expect(syntaxErrorFrom('<a a:b:c />')).toMatchObject({
        message: expect.stringContaining("An attribute name cannot hold more than one ':'"),
        line: 1,
        column: 7,
      });
    });
  });

  describe('rejects a malformed expression', () => {
    it('rejects an expression that is never closed', () => {
      expect(syntaxErrorFrom('<a>{1</a>')).toMatchObject({
        message: expect.stringContaining('Unterminated expression'),
        line: 1,
        column: 4,
      });
    });

    it('rejects an expression holding an identifier rather than a JSON value', () => {
      expect(syntaxErrorFrom('<a>{total}</a>')).toMatchObject({
        message: expect.stringContaining('Expected a single JSON value between `{` and `}`'),
        line: 1,
        column: 4,
      });
    });

    it('rejects an empty expression', () => {
      expect(syntaxErrorFrom('<a>{}</a>')).toMatchObject({
        message: expect.stringContaining('Expected a single JSON value between `{` and `}`'),
        line: 1,
        column: 4,
      });
    });

    it('rejects a single-quoted string, which is not JSON', () => {
      expect(syntaxErrorFrom("<a>{'text'}</a>")).toMatchObject({
        message: expect.stringContaining('Expected a single JSON value between `{` and `}`'),
        line: 1,
        column: 4,
      });
    });
  });

  describe('reports where the problem is', () => {
    const MULTI_LINE_SOURCE = `<page>
  <a foo=bar />
</page>`;

    it('counts lines separated by a line feed', () => {
      expect(syntaxErrorFrom(MULTI_LINE_SOURCE)).toMatchObject({ line: 2, column: 10, offset: 16 });
    });

    it('counts a carriage return and line feed pair as one line break', () => {
      expect(syntaxErrorFrom('<page>\r\n  <a foo=bar />\r\n</page>').line).toBe(2);
    });

    it('counts a lone carriage return as a line break', () => {
      expect(syntaxErrorFrom('<page>\r  <a foo=bar />\r</page>').line).toBe(2);
    });

    it('shows the offending line with a caret under the problem', () => {
      expect(syntaxErrorFrom(MULTI_LINE_SOURCE).frame).toBe(`2 |   <a foo=bar />
  |          ^`);
    });

    it('includes the line, the column and the frame in the message', () => {
      expect(syntaxErrorFrom(MULTI_LINE_SOURCE).message).toBe(
        'Expected a quoted string or a `{…}` JSON value after `=` (2:10)\n\n2 |   <a foo=bar />\n  |          ^',
      );
    });
  });

  describe('throws a recognisable error', () => {
    it('throws a JSXSyntaxError', () => {
      expect(() => parse('')).toThrow(JSXSyntaxError);
    });

    it('throws something catchable as a StaticJSXError', () => {
      expect(() => parse('')).toThrow(StaticJSXError);
    });

    it('names the error after its class', () => {
      expect(syntaxErrorFrom('').name).toBe('JSXSyntaxError');
    });
  });
});
