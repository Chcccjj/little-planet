import { palette } from '../config/palette'

export interface HintView {
  show(x: number, y: number, target: string): void
  hide(): void
  dispose(): void
}

/** One chip reused for whichever prop the prince is close to. */
export function createHint(): HintView {
  ensureStyle()
  const el = document.createElement('p')
  el.className = 'interact-hint'
  el.textContent = 'E / 点击'
  el.hidden = true
  el.setAttribute('aria-hidden', 'true')
  document.body.append(el)

  return {
    show(x: number, y: number, target: string): void {
      el.hidden = false
      el.dataset.target = target
      const width = el.offsetWidth || 72
      const height = el.offsetHeight || 24
      const left = clamp(x, 8 + width / 2, window.innerWidth - 8 - width / 2)
      const top = clamp(y, 8 + height * 1.3, window.innerHeight - 8)
      el.style.left = `${left}px`
      el.style.top = `${top}px`
    },
    hide(): void {
      el.hidden = true
      delete el.dataset.target
    },
    dispose(): void {
      el.remove()
    },
  }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return (min + max) / 2
  return Math.max(min, Math.min(max, value))
}

function ensureStyle(): void {
  if (document.getElementById('interact-hint-style')) return
  const style = document.createElement('style')
  style.id = 'interact-hint-style'
  style.textContent = `
    .interact-hint {
      position: fixed;
      z-index: 3;
      margin: 0;
      transform: translate(-50%, -130%);
      padding: 5px 10px;
      border-radius: 999px;
      background: rgba(242, 239, 233, 0.94);
      color: ${palette.ink};
      font: 12px/1.2 -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Noto Sans SC", "Segoe UI", sans-serif;
      letter-spacing: 0.04em;
      white-space: nowrap;
      box-shadow: 0 1px 2px rgba(60, 64, 68, 0.12);
      pointer-events: none;
      user-select: none;
      -webkit-user-select: none;
    }
    .interact-hint[hidden] {
      display: none !important;
    }
  `
  document.head.appendChild(style)
}
