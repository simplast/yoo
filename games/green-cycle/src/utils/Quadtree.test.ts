import { describe, it, expect } from 'vitest';
import { Quadtree } from './Quadtree';
import type { QuadtreeItem } from './Quadtree';

describe('Quadtree', () => {
  it('insert + retrieve returns the inserted item', () => {
    const qt = new Quadtree({ x: 0, y: 0, w: 100, h: 100 });
    const item: QuadtreeItem = { x: 50, y: 50, ref: 'a' };
    qt.insert(item);
    expect(qt.retrieve(50, 50, 1)).toContain('a');
  });

  it('retrieve outside range returns empty', () => {
    const qt = new Quadtree({ x: 0, y: 0, w: 100, h: 100 });
    qt.insert({ x: 10, y: 10, ref: 'a' });
    expect(qt.retrieve(90, 90, 5)).toHaveLength(0);
  });

  it('retrieve returns all items inside the query range', () => {
    const qt = new Quadtree({ x: 0, y: 0, w: 100, h: 100 });
    qt.insert({ x: 10, y: 10, ref: 'a' });
    qt.insert({ x: 15, y: 15, ref: 'b' });
    qt.insert({ x: 90, y: 90, ref: 'c' });
    const result = qt.retrieve(12, 12, 10);
    expect(result).toContain('a');
    expect(result).toContain('b');
    expect(result).not.toContain('c');
  });

  it('retrieve includes items exactly on the query boundary', () => {
    const qt = new Quadtree({ x: 0, y: 0, w: 100, h: 100 });
    qt.insert({ x: 10, y: 0, ref: 'edge' });
    expect(qt.retrieve(0, 0, 10)).toContain('edge');
  });

  it('clear removes all items', () => {
    const qt = new Quadtree({ x: 0, y: 0, w: 100, h: 100 });
    qt.insert({ x: 50, y: 50, ref: 'a' });
    qt.clear();
    expect(qt.retrieve(50, 50, 10)).toHaveLength(0);
  });

  it('still queries correctly after splitting due to capacity overflow', () => {
    // maxObjects=1 forces a split after inserting the second item
    const qt = new Quadtree({ x: 0, y: 0, w: 100, h: 100 }, 1);
    qt.insert({ x: 10, y: 10, ref: 'nw' });
    qt.insert({ x: 90, y: 90, ref: 'se' });
    qt.insert({ x: 10, y: 90, ref: 'sw' });
    qt.insert({ x: 90, y: 10, ref: 'ne' });

    expect(qt.retrieve(10, 10, 5)).toContain('nw');
    expect(qt.retrieve(90, 90, 5)).toContain('se');
    expect(qt.retrieve(10, 90, 5)).toContain('sw');
    expect(qt.retrieve(90, 10, 5)).toContain('ne');
  });
});
