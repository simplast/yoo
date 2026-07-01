import { describe, expect, it } from 'vitest';
import { compareHands } from '../src/rules/compare';
import { analyzeHand } from '../src/rules/handAnalyzer';

describe('compareHands', () => {
  it('allows same type and length with higher primary value', () => {
    const previous = analyzeHand(['S3', 'H3']);
    const candidate = analyzeHand(['S4', 'H4']);

    expect(compareHands(candidate, previous).canBeat).toBe(true);
  });

  it('rejects type, length, and lower-value mismatches', () => {
    expect(compareHands(analyzeHand(['S4']), analyzeHand(['S3', 'H3'])).code).toBe('TYPE_MISMATCH');
    expect(compareHands(analyzeHand(['S4', 'H5', 'C6', 'D7', 'S8', 'H9']), analyzeHand(['S3', 'H4', 'C5', 'D6', 'S7'])).code).toBe('LENGTH_MISMATCH');
    expect(compareHands(analyzeHand(['S3', 'H3']), analyzeHand(['S4', 'H4'])).code).toBe('NOT_HIGHER');
  });

  it('lets bombs beat non-bombs but not rocket', () => {
    expect(compareHands(analyzeHand(['S6', 'H6', 'C6', 'D6']), analyzeHand(['S9'])).canBeat).toBe(true);
    expect(compareHands(analyzeHand(['S6', 'H6', 'C6', 'D6']), analyzeHand(['BJ', 'RJ'])).code).toBe('ROCKET_UNBEATABLE');
  });

  it('lets rocket beat every non-rocket hand', () => {
    expect(compareHands(analyzeHand(['BJ', 'RJ']), analyzeHand(['SA', 'HA', 'CA', 'DA'])).canBeat).toBe(true);
  });
});
