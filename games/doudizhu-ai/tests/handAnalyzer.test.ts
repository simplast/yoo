import { describe, expect, it } from 'vitest';
import { analyzeHand } from '../src/rules/handAnalyzer';

function expectType(cards: Parameters<typeof analyzeHand>[0], type: ReturnType<typeof analyzeHand>['type'], primaryValue?: number): void {
  const pattern = analyzeHand(cards);
  expect(pattern.type).toBe(type);
  if (primaryValue !== undefined) {
    expect(pattern.primaryValue).toBe(primaryValue);
  }
}

describe('analyzeHand', () => {
  it('recognizes basic hands', () => {
    expectType(['S3'], 'single', 3);
    expectType(['S3', 'H3'], 'pair', 3);
    expectType(['S3', 'H3', 'C3'], 'triple', 3);
    expectType(['S3', 'H3', 'C3', 'D4'], 'triple-single', 3);
    expectType(['S3', 'H3', 'C3', 'D4', 'S4'], 'triple-pair', 3);
  });

  it('recognizes sequences and excludes 2/jokers from sequences', () => {
    expectType(['S3', 'H4', 'C5', 'D6', 'S7'], 'straight', 7);
    expectType(['S3', 'H3', 'S4', 'H4', 'S5', 'H5'], 'consecutive-pairs', 5);
    expect(analyzeHand(['S10', 'HJ', 'CQ', 'DK', 'SA', 'H2']).type).toBe('invalid');
  });

  it('recognizes airplane variants', () => {
    expectType(['S3', 'H3', 'C3', 'S4', 'H4', 'C4'], 'airplane', 4);
    expectType(['S3', 'H3', 'C3', 'S4', 'H4', 'C4', 'D7', 'S8'], 'airplane-singles', 4);
    expectType(['S3', 'H3', 'C3', 'S4', 'H4', 'C4', 'D7', 'S7', 'D8', 'S8'], 'airplane-pairs', 4);
  });

  it('recognizes four-two, bombs, and rocket', () => {
    expectType(['S9', 'H9', 'C9', 'D9', 'S3', 'H4'], 'four-two', 9);
    expectType(['S9', 'H9', 'C9', 'D9'], 'bomb', 9);
    expectType(['BJ', 'RJ'], 'rocket', 17);
  });

  it('rejects duplicates and unsupported shapes', () => {
    expect(analyzeHand(['S3', 'S3']).type).toBe('invalid');
    expect(analyzeHand(['S3', 'H3', 'C4']).type).toBe('invalid');
  });
});
