import { describe, expect, it } from 'vitest';
import { parseToolCallResponse } from '../src/ai/responseParser';
import type { CardId } from '../src/types';

/** 足够匹配的测试用手牌 */
const HAND: CardId[] = ['S3', 'H3', 'C5', 'D5', 'S7', 'HK', 'DK', 'S2', 'C2', 'BJ', 'RJ'];

describe('parseToolCallResponse', () => {
  it('accepts rank-only card names and maps to CardIds', () => {
    const result = parseToolCallResponse(
      JSON.stringify({
        tool: 'validateMove',
        arguments: { action: 'play', cards: ['3', '3'], reason: '小对子试探。' },
        speech: '先算这一手。',
      }),
      HAND,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.proposal.arguments.action).toBe('play');
      // 应从手牌中匹配到两张 3（S3, H3）
      expect(result.proposal.arguments.cards).toEqual(['S3', 'H3']);
      expect(result.proposal.speech).toBe('先算这一手。');
    }
  });

  it('extracts the first JSON object when a model wraps it in extra text', () => {
    const result = parseToolCallResponse(
      '```json\n{"tool":"validateMove","arguments":{"action":"pass","cards":[],"reason":"不划算。"},"speech":"这一手先让。"}\n```',
      HAND,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.proposal.arguments.action).toBe('pass');
      expect(result.proposal.arguments.cards).toEqual([]);
    }
  });

  it('rejects non validateMove tools', () => {
    const result = parseToolCallResponse(
      JSON.stringify({ tool: 'otherTool', arguments: { action: 'pass', cards: [] }, speech: '过。' }),
      HAND,
    );

    expect(result).toMatchObject({ ok: false, code: 'INVALID_TOOL' });
  });

  it('rejects invalid rank names', () => {
    expect(
      parseToolCallResponse(JSON.stringify({ tool: 'validateMove', arguments: { action: 'play', cards: ['Z9'] }, speech: '出。' }), HAND),
    ).toMatchObject({ ok: false, code: 'INVALID_CARD' });
  });

  it('rejects cards not in hand', () => {
    expect(
      parseToolCallResponse(JSON.stringify({ tool: 'validateMove', arguments: { action: 'play', cards: ['Q'] }, speech: '出。' }), HAND),
    ).toMatchObject({ ok: false, code: 'CARDS_NOT_OWNED' });
  });

  it('enforces pass/play card-count constraints', () => {
    expect(
      parseToolCallResponse(JSON.stringify({ tool: 'validateMove', arguments: { action: 'pass', cards: ['3'] }, speech: '过。' }), HAND),
    ).toMatchObject({ ok: false, code: 'PASS_WITH_CARDS' });

    expect(
      parseToolCallResponse(JSON.stringify({ tool: 'validateMove', arguments: { action: 'play', cards: [] }, speech: '出。' }), HAND),
    ).toMatchObject({ ok: false, code: 'PLAY_WITHOUT_CARDS' });
  });

  it('truncates overly long speech to SPEECH_MAX_LENGTH', () => {
    const result = parseToolCallResponse(
      JSON.stringify({ tool: 'validateMove', arguments: { action: 'pass', cards: [], reason: '测试。' }, speech: '过重复', }),
      HAND,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.proposal.speech.length).toBeLessThanOrEqual(40);
    }
  });
});
