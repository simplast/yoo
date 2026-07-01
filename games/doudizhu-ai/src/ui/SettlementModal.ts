/**
 * 结算弹窗
 *
 * 展示：
 * - 胜方（地主阵营/农民阵营）
 * - 胜负原因（出完手牌 或 AI 强制判负）
 * - 最终倍数
 * - 每位玩家的分数变化（正/负）
 * - 再来一局 / 调整配置按钮
 */
import type { PlayerId, RoundResult } from '../types';
import { playerDisplayName } from './ConfigPanel';

export interface SettlementModalEvents {
  onNewRound: () => void;
  onConfig: () => void;
}

export class SettlementModal {
  readonly element: HTMLDivElement;
  private readonly events: SettlementModalEvents;

  constructor(events: SettlementModalEvents) {
    this.events = events;
    this.element = document.createElement('div');
    this.element.className = 'settlement-modal';
    this.element.hidden = true;
    this.element.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.dataset.action === 'new-round') this.events.onNewRound();
      if (target.dataset.action === 'config') this.events.onConfig();
    });
  }

  show(result: RoundResult): void {
    const sideText = result.winnerSide === 'landlord' ? '地主阵营' : '农民阵营';
    const deltas = (Object.entries(result.scoreDelta) as [PlayerId, number][])
      .map(([playerId, delta]) => `
        <li>
          <span>${playerDisplayName(playerId)}</span>
          <strong class="${delta >= 0 ? 'score-positive' : 'score-negative'}">${delta >= 0 ? '+' : ''}${delta}</strong>
        </li>
      `)
      .join('');

    this.element.innerHTML = `
      <div class="modal-backdrop"></div>
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="settlement-title">
        <div class="panel-eyebrow">Settlement</div>
        <h2 id="settlement-title">${sideText}获胜</h2>
        <p>${result.message}</p>
        <div class="settlement-multiplier">最终倍数 ×${result.multiplier}</div>
        <ul class="score-list">${deltas}</ul>
        <div class="modal-actions">
          <button class="primary-action" data-action="new-round" type="button">再来一局</button>
          <button class="secondary-action" data-action="config" type="button">调整配置</button>
        </div>
      </section>
    `;
    this.element.hidden = false;
  }

  hide(): void { this.element.hidden = true; }
}
