/**
 * Toast 浮动提示
 *
 * 支持 4 种类型：info / success / warning / error。
 * 自动在 timeoutMs 后隐藏。
 */
export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export class Toast {
  readonly element: HTMLDivElement;
  private hideTimer = 0;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'toast';
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-live', 'polite');
  }

  show(message: string, kind: ToastKind = 'info', timeoutMs = 2800): void {
    window.clearTimeout(this.hideTimer);
    this.element.textContent = message;
    this.element.dataset.kind = kind;
    this.element.classList.add('toast--visible');
    if (timeoutMs > 0) this.hideTimer = window.setTimeout(() => this.hide(), timeoutMs);
  }

  hide(): void { this.element.classList.remove('toast--visible'); }
}
