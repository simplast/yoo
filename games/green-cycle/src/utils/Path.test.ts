import { describe, it, expect } from 'vitest';
import { Path } from './Path';

describe('Path', () => {
  const path = Path.createLoopPath(1280, 720, 80, 320);

  it('createLoopPath produces a non-empty path with many points', () => {
    expect(path.points.length).toBeGreaterThan(8);
    expect(path.totalLength).toBeGreaterThan(0);
  });

  it('getPosition(0) returns the start point', () => {
    expect(path.getPosition(0)).toEqual({ x: 80, y: 80 });
  });

  it('getPosition(0.5) returns a point near the middle of the path', () => {
    const mid = path.getPosition(0.5);
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(1280);
    expect(mid.y).toBeGreaterThan(0);
    expect(mid.y).toBeLessThan(720);
  });

  it('getPosition(1) is equivalent to getPosition(0)', () => {
    expect(path.getPosition(1)).toEqual(path.getPosition(0));
  });

  it('getPosition normalizes negative progress to [0,1)', () => {
    expect(path.getPosition(-0.1)).toEqual(path.getPosition(0.9));
  });

  it('getDirection returns a unit vector', () => {
    const dir = path.getDirection(0.25);
    const len = Math.hypot(dir.x, dir.y);
    expect(len).toBeCloseTo(1);
  });

  it('path is approximately closed', () => {
    const start = path.getPosition(0);
    const nearEnd = path.getPosition(0.999);
    const dist = Math.hypot(nearEnd.x - start.x, nearEnd.y - start.y);
    expect(dist).toBeLessThan(10);
  });
});
