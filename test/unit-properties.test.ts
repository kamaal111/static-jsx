import fc from 'fast-check';

import {
  PROPERTY_OPTIONS,
  arbAttributeName,
  arbBinaryString,
  arbElementName,
  arbInvalidAttributeName,
  arbInvalidElementName,
  arbTextLike,
  arbWritableNumber,
} from './arbitraries.ts';
import { element, expression } from './helpers.ts';
import { decodeEntities, escapeAttribute, escapeText } from '../src/entities.ts';
import { isAttributeName, isElementName } from '../src/names.ts';
import { parse } from '../src/parser.ts';
import { stringify } from '../src/stringify.ts';
import type { JsonValue } from '../src/types.ts';
import { normalizeText } from '../src/whitespace.ts';

const DEEP = 10_000;

function expressionValue(source: string): JsonValue {
  const [child] = parse(source).children;

  if (child?.type !== 'expression') {
    throw new Error(`Expected an expression child, but got a ${child?.type ?? 'missing node'}`);
  }

  return child.value;
}

describe('escaping text', () => {
  it('is undone by decoding it again', () => {
    fc.assert(
      fc.property(arbTextLike, value => {
        expect(decodeEntities(escapeText(value))).toBe(value);
      }),
      PROPERTY_OPTIONS,
    );
  });

  it('leaves nothing for whitespace normalization to eat', () => {
    fc.assert(
      fc.property(arbTextLike, value => {
        expect(normalizeText(escapeText(value))).toBe(escapeText(value));
      }),
      PROPERTY_OPTIONS,
    );
  });
});

describe('escaping an attribute value', () => {
  it('is undone by decoding it again', () => {
    fc.assert(
      fc.property(arbTextLike, value => {
        expect(decodeEntities(escapeAttribute(value))).toBe(value);
      }),
      PROPERTY_OPTIONS,
    );
  });
});

describe('normalizeText', () => {
  it('changes nothing when it runs a second time', () => {
    fc.assert(
      fc.property(arbTextLike, raw => {
        expect(normalizeText(normalizeText(raw))).toBe(normalizeText(raw));
      }),
      PROPERTY_OPTIONS,
    );
  });

  it('leaves no tab or line break behind', () => {
    fc.assert(
      fc.property(arbTextLike, raw => {
        expect(/[\t\r\n]/.test(normalizeText(raw))).toBe(false);
      }),
      PROPERTY_OPTIONS,
    );
  });
});

describe('isElementName', () => {
  it('accepts exactly the names the parser reads back unchanged', () => {
    fc.assert(
      fc.property(fc.oneof(arbElementName, arbInvalidElementName, arbBinaryString), candidate => {
        let parsedName: string | undefined;

        try {
          const root = parse(`<${candidate} />`);
          parsedName = root.type === 'element' ? root.name : undefined;
        } catch {
          parsedName = undefined;
        }

        expect(isElementName(candidate)).toBe(parsedName === candidate);
      }),
      PROPERTY_OPTIONS,
    );
  });
});

describe('isAttributeName', () => {
  it('accepts exactly the names the parser reads back unchanged', () => {
    fc.assert(
      fc.property(fc.oneof(arbAttributeName, arbInvalidAttributeName, arbBinaryString), candidate => {
        let parsedName: string | undefined;

        try {
          const root = parse(`<a ${candidate} />`);
          parsedName =
            root.type === 'element' && Object.keys(root.attributes).length === 1
              ? Object.keys(root.attributes)[0]
              : undefined;
        } catch {
          parsedName = undefined;
        }

        expect(isAttributeName(candidate)).toBe(parsedName === candidate);
      }),
      PROPERTY_OPTIONS,
    );
  });
});

describe('a number a document may hold', () => {
  it('reads back as exactly the same double', () => {
    fc.assert(
      fc.property(arbWritableNumber, value => {
        expect(Object.is(expressionValue(stringify(element('a', {}, [expression(value)]))), value)).toBe(true);
      }),
      PROPERTY_OPTIONS,
    );
  });
});

describe('a document nested far deeper than the call stack would allow', () => {
  it('parses a chain of elements without overflowing', () => {
    const source = `${'<a>'.repeat(DEEP)}${'</a>'.repeat(DEEP)}`;

    expect(parse(source).type).toBe('element');
  });

  it('parses a chain of fragments without overflowing', () => {
    const source = `${'<>'.repeat(DEEP)}${'</>'.repeat(DEEP)}`;

    expect(parse(source).type).toBe('fragment');
  });

  it('parses an attribute holding a deeply nested JSON value without overflowing', () => {
    const source = `<a v={${'['.repeat(DEEP)}1${']'.repeat(DEEP)}} />`;

    expect(parse(source).type).toBe('element');
  });

  it('prints a deeply nested tree back, and reads it as the same document again', () => {
    const printed = stringify(parse(`${'<a>'.repeat(DEEP)}${'</a>'.repeat(DEEP)}`), { indent: '' });

    expect(stringify(parse(printed), { indent: '' })).toBe(printed);
  });
});
