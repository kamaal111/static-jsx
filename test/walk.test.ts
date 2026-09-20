import { cursorFor, label, pathTo } from './helpers.ts';
import { childrenOf, type JSXCursor } from '../src/cursor.ts';
import { parse } from '../src/parser.ts';
import { walk } from '../src/walk.ts';

function labels(cursors: Iterable<JSXCursor>): string[] {
  return Array.from(cursors, label);
}

describe('walk', () => {
  it('yields the root first', () => {
    expect(labels(walk(parse('<row><a /></row>')))[0]).toBe('row');
  });

  it('yields every node in document order', () => {
    expect(labels(walk(parse('<row><a><b /></a><c /></row>')))).toEqual(['row', 'a', 'b', 'c']);
  });

  it('yields a lone element as the only node', () => {
    expect(labels(walk(parse('<a />')))).toEqual(['a']);
  });

  it('yields text and expression nodes alongside elements', () => {
    expect(labels(walk(parse('<p>hi{42}</p>')))).toEqual(['p', 'text', 'expression']);
  });

  it('walks a document rooted at a fragment', () => {
    expect(labels(walk(parse('<><a /><b /></>')))).toEqual(['fragment', 'a', 'b']);
  });

  it('reports the depth of each node', () => {
    const depths = Array.from(walk(parse('<row><a><b /></a></row>')), cursor => cursor.depth);

    expect(depths).toEqual([0, 1, 2]);
  });

  it('reports the path of each node', () => {
    const paths = Array.from(walk(parse('<row><a><b /></a><c /></row>')), cursor => pathTo(cursor));

    expect(paths).toEqual([[], [0], [0, 0], [1]]);
  });

  it('starts from a cursor rather than the document when given one', () => {
    const inner = childrenOf(cursorFor('<row><a><b /></a><c /></row>'))[0];

    expect(inner === undefined ? [] : labels(walk(inner))).toEqual(['a', 'b']);
  });

  it('keeps the absolute depth when it starts from a cursor', () => {
    const inner = childrenOf(cursorFor('<row><a /></row>'))[0];

    expect(inner === undefined ? undefined : Array.from(walk(inner), cursor => cursor.depth)).toEqual([1]);
  });

  it('is lazy enough to stop before visiting the whole document', () => {
    const walked = walk(parse('<row><a /><b /><c /></row>'));
    const first = walked.next().value;

    expect(first === undefined ? undefined : labels([first])).toEqual(['row']);
  });

  it('walks a document nested far past the call stack limit', () => {
    const depth = 10_000;
    const source = '<a>'.repeat(depth) + '</a>'.repeat(depth);

    expect(Array.from(walk(parse(source))).length).toBe(depth);
  });
});
