import { describe, expect, it } from 'vitest';
import { decideAiMove, type LlmClient, type ValidateMove } from '../src/ai';
import type { GameState, MoveProposal, NormalizedMove, ValidationResult } from '../src/types';

const baseState: GameState = {
  phase: 'awaiting-ai',
  players: {
    human: { id: 'human', name: '你', role: 'farmer', hand: ['S4'], score: 0 },
    'ai-calm': { id: 'ai-calm', name: '冷静数学派', role: 'landlord', hand: ['S3', 'H3'], score: 0 },
    'ai-aggressive': { id: 'ai-aggressive', name: '激进压迫派', role: 'farmer', hand: ['D5'], score: 0 },
  },
  order: ['human', 'ai-calm', 'ai-aggressive'],
  currentPlayerId: 'ai-calm',
  landlordId: 'ai-calm',
  bottomCards: [],
  previousMove: null,
  trickLeaderId: 'ai-calm',
  passCount: 0,
  multiplier: 1,
  history: [],
};

const aiSettings = {
  provider: 'deepseek' as const,
  model: 'deepseek-chat',
  apiKey: 'test-key',
  rememberKey: false,
};

function clientReturning(texts: string[]): LlmClient {
  let index = 0;
  return {
    async complete() {
      const text = texts[Math.min(index, texts.length - 1)];
      index += 1;
      return { ok: true, text };
    },
  };
}

describe('decideAiMove', () => {
  it('retries parser/validation failures and returns the first valid move', async () => {
    const validMove: NormalizedMove = {
      playerId: 'ai-calm',
      action: 'play',
      cards: ['S3'],
      pattern: { type: 'single', cards: ['S3'], primaryValue: 3, length: 1 },
    };

    const validateMove: ValidateMove = (_state: GameState, proposal: MoveProposal): ValidationResult => {
      if (proposal.action === 'play' && proposal.cards[0] === 'S3') {
        return { ok: true, normalizedMove: validMove };
      }
      return { ok: false, code: 'INVALID_MOVE', message: '不能这样出。' };
    };

    const result = await decideAiMove({
      state: baseState,
      playerId: 'ai-calm',
      aiSettings,
      validateMove,
      llmClient: clientReturning([
        'not json',
        JSON.stringify({ tool: 'validateMove', arguments: { action: 'play', cards: ['S9'] }, speech: '试一下。' }),
        JSON.stringify({ tool: 'validateMove', arguments: { action: 'play', cards: ['S3'] }, speech: '按最优解走。' }),
      ]),
    });

    expect(result.ok).toBe(true);
    expect(result.attempts).toHaveLength(3);
    if (result.ok) {
      expect(result.move).toEqual(validMove);
      expect(result.speech).toBe('按最优解走。');
    }
  });

  it('returns forced-loss after three content/validation failures', async () => {
    const result = await decideAiMove({
      state: baseState,
      playerId: 'ai-calm',
      aiSettings,
      validateMove: () => ({ ok: false, code: 'INVALID_MOVE', message: '非法动作。' }),
      llmClient: clientReturning([
        JSON.stringify({ tool: 'validateMove', arguments: { action: 'play', cards: ['S3'] }, speech: '一。' }),
        JSON.stringify({ tool: 'validateMove', arguments: { action: 'play', cards: ['H3'] }, speech: '二。' }),
        JSON.stringify({ tool: 'validateMove', arguments: { action: 'play', cards: ['S3'] }, speech: '三。' }),
      ]),
    });

    expect(result).toMatchObject({ ok: false, kind: 'forced-loss', forcedLoserId: 'ai-calm', winnerSide: 'farmer' });
    expect(result.attempts).toHaveLength(3);
  });

  it('returns llm-error without forced loss when the proxy reports a provider error', async () => {
    const result = await decideAiMove({
      state: baseState,
      playerId: 'ai-calm',
      aiSettings,
      validateMove: () => ({ ok: false, code: 'SHOULD_NOT_VALIDATE', message: 'should not run' }),
      llmClient: {
        async complete() {
          return { ok: false, error: { code: 'PROVIDER_AUTH_FAILED', message: 'Key 无效。' } };
        },
      },
    });

    expect(result).toMatchObject({ ok: false, kind: 'llm-error', code: 'PROVIDER_AUTH_FAILED' });
    expect(result.attempts).toHaveLength(1);
  });
});
