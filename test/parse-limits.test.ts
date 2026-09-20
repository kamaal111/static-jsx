import { JSXLimitError, JSXSyntaxError, StaticJSXError } from '../src/errors.ts';
import { parse, type ParseOptions } from '../src/parser.ts';

function limitErrorFrom(source: string, options: ParseOptions): JSXLimitError {
  try {
    parse(source, options);
  } catch (error) {
    if (error instanceof JSXLimitError) {
      return error;
    }

    throw error;
  }

  throw new Error(`Expected ${JSON.stringify(source)} to be rejected, but it parsed`);
}

function nested(depth: number): string {
  let open = '';
  let close = '';

  for (let i = 0; i < depth - 1; i += 1) {
    open += `<a${i}>`;
    close = `</a${i}>${close}`;
  }

  return `${open}<a${depth - 1} />${close}`;
}

function siblings(count: number): string {
  return `<a>${'<b />'.repeat(count)}</a>`;
}

function attributes(count: number): string {
  return Array.from({ length: count }, (_, i) => `x${i}="${i}"`).join(' ');
}

describe('parse', () => {
  describe('with no options', () => {
    it('parses a large, deeply nested document without limits', () => {
      expect(() => parse(nested(200))).not.toThrow();
      expect(() => parse(siblings(2000))).not.toThrow();
    });

    it('parses the same document with an empty options object', () => {
      expect(() => parse(siblings(200), {})).not.toThrow();
    });
  });

  describe('enforces maxSourceLength', () => {
    const source = '<a />';

    it('parses when the source is exactly at the limit', () => {
      expect(() => parse(source, { maxSourceLength: source.length })).not.toThrow();
    });

    it('throws when the source exceeds the limit', () => {
      expect(limitErrorFrom(source, { maxSourceLength: source.length - 1 })).toMatchObject({
        limit: 'maxSourceLength',
        limitValue: source.length - 1,
        actualValue: source.length,
        offset: 0,
      });
    });
  });

  describe('enforces maxDepth', () => {
    it('parses when nesting is exactly at the limit', () => {
      expect(() => parse(nested(5), { maxDepth: 5 })).not.toThrow();
    });

    it('throws when nesting exceeds the limit', () => {
      expect(limitErrorFrom(nested(6), { maxDepth: 5 })).toMatchObject({
        limit: 'maxDepth',
        limitValue: 5,
        actualValue: 6,
      });
    });

    it('throws for a self-closing root that is already too deep', () => {
      expect(limitErrorFrom('<a />', { maxDepth: 0 })).toMatchObject({
        limit: 'maxDepth',
        limitValue: 0,
        actualValue: 1,
      });
    });
  });

  describe('enforces maxNodes', () => {
    it('parses when the node count is exactly at the limit', () => {
      expect(() => parse(siblings(4), { maxNodes: 5 })).not.toThrow();
    });

    it('throws when the node count exceeds the limit', () => {
      expect(limitErrorFrom(siblings(5), { maxNodes: 5 })).toMatchObject({
        limit: 'maxNodes',
        limitValue: 5,
        actualValue: 6,
      });
    });

    it('counts a text node', () => {
      expect(() => parse('<a>hello</a>', { maxNodes: 2 })).not.toThrow();
      expect(limitErrorFrom('<a>hello</a>', { maxNodes: 1 })).toMatchObject({
        limit: 'maxNodes',
        actualValue: 2,
      });
    });

    it('counts an expression node', () => {
      expect(() => parse('<a>{1}</a>', { maxNodes: 2 })).not.toThrow();
      expect(limitErrorFrom('<a>{1}</a>', { maxNodes: 1 })).toMatchObject({
        limit: 'maxNodes',
        actualValue: 2,
      });
    });

    it('counts a fragment', () => {
      expect(() => parse('<><b /></>', { maxNodes: 2 })).not.toThrow();
      expect(limitErrorFrom('<><b /></>', { maxNodes: 1 })).toMatchObject({
        limit: 'maxNodes',
        actualValue: 2,
      });
    });
  });

  describe('enforces maxAttributesPerNode', () => {
    it('parses when the attribute count is exactly at the limit', () => {
      expect(() => parse(`<a ${attributes(3)} />`, { maxAttributesPerNode: 3 })).not.toThrow();
    });

    it('throws when the attribute count exceeds the limit', () => {
      expect(limitErrorFrom(`<a ${attributes(4)} />`, { maxAttributesPerNode: 3 })).toMatchObject({
        limit: 'maxAttributesPerNode',
        limitValue: 3,
        actualValue: 4,
      });
    });
  });

  describe('enforces maxChildrenPerNode', () => {
    it('parses when the child count is exactly at the limit', () => {
      expect(() => parse(siblings(3), { maxChildrenPerNode: 3 })).not.toThrow();
    });

    it('throws when the child count exceeds the limit', () => {
      expect(limitErrorFrom(siblings(4), { maxChildrenPerNode: 3 })).toMatchObject({
        limit: 'maxChildrenPerNode',
        limitValue: 3,
        actualValue: 4,
      });
    });

    it('counts children of different kinds, including a promoted element', () => {
      const source = '<a>text{1}<b></b></a>';

      expect(() => parse(source, { maxChildrenPerNode: 3 })).not.toThrow();
      expect(limitErrorFrom(source, { maxChildrenPerNode: 2 })).toMatchObject({
        limit: 'maxChildrenPerNode',
        actualValue: 3,
      });
    });
  });

  describe('enforces maxNameLength', () => {
    it('parses a tag name exactly at the limit', () => {
      const name = 'a'.repeat(5);

      expect(() => parse(`<${name} />`, { maxNameLength: 5 })).not.toThrow();
    });

    it('throws for a tag name over the limit', () => {
      const name = 'a'.repeat(6);

      expect(limitErrorFrom(`<${name} />`, { maxNameLength: 5 })).toMatchObject({
        limit: 'maxNameLength',
        limitValue: 5,
        actualValue: 6,
        column: 2,
      });
    });

    it('parses an attribute name exactly at the limit', () => {
      const name = 'b'.repeat(5);

      expect(() => parse(`<a ${name}="1" />`, { maxNameLength: 5 })).not.toThrow();
    });

    it('throws for an attribute name over the limit', () => {
      const name = 'b'.repeat(6);

      expect(limitErrorFrom(`<a ${name}="1" />`, { maxNameLength: 5 })).toMatchObject({
        limit: 'maxNameLength',
        limitValue: 5,
        actualValue: 6,
      });
    });

    it('counts every segment and separator of a dotted tag name', () => {
      expect(() => parse('<a.bb />', { maxNameLength: 4 })).not.toThrow();

      expect(limitErrorFrom('<a.bb />', { maxNameLength: 3 })).toMatchObject({
        limit: 'maxNameLength',
        limitValue: 3,
        actualValue: 4,
      });
    });

    it('counts both sides and the separator of a namespaced tag name', () => {
      expect(() => parse('<ns:a />', { maxNameLength: 4 })).not.toThrow();

      expect(limitErrorFrom('<ns:a />', { maxNameLength: 3 })).toMatchObject({
        limit: 'maxNameLength',
        limitValue: 3,
        actualValue: 4,
      });
    });
  });

  describe('enforces maxAttributeValueLength', () => {
    it('parses a quoted value exactly at the limit', () => {
      const value = 'x'.repeat(5);

      expect(() => parse(`<a b="${value}" />`, { maxAttributeValueLength: 5 })).not.toThrow();
    });

    it('throws for a quoted value over the limit', () => {
      const value = 'x'.repeat(6);

      expect(limitErrorFrom(`<a b="${value}" />`, { maxAttributeValueLength: 5 })).toMatchObject({
        limit: 'maxAttributeValueLength',
        limitValue: 5,
        actualValue: 6,
      });
    });

    it('parses a JSON expression value exactly at the limit', () => {
      expect(() => parse('<a b={   1   } />', { maxAttributeValueLength: 7 })).not.toThrow();
    });

    it('throws for a JSON expression value over the limit', () => {
      expect(limitErrorFrom('<a b={    1   } />', { maxAttributeValueLength: 7 })).toMatchObject({
        limit: 'maxAttributeValueLength',
        limitValue: 7,
        actualValue: 8,
      });
    });

    it('measures a JSON expression by its 7-character padded source, not its 1-character parsed value', () => {
      expect(limitErrorFrom('<a b={   1   } />', { maxAttributeValueLength: 5 })).toMatchObject({
        limit: 'maxAttributeValueLength',
        limitValue: 5,
        actualValue: 7,
      });
    });
  });

  describe('reports a JSXLimitError distinctly from a JSXSyntaxError', () => {
    it('is an instance of StaticJSXError', () => {
      expect(limitErrorFrom('<a />', { maxSourceLength: 0 })).toBeInstanceOf(StaticJSXError);
    });

    it('is not an instance of JSXSyntaxError', () => {
      expect(limitErrorFrom('<a />', { maxSourceLength: 0 })).not.toBeInstanceOf(JSXSyntaxError);
    });

    it('names the error after its class', () => {
      expect(limitErrorFrom('<a />', { maxSourceLength: 0 }).name).toBe('JSXLimitError');
    });
  });
});
