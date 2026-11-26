import { palette } from '../config/palette'
import { readSafeInsets, readViewport, type SafeInsets } from '../core/viewport'

export interface HintView {
  show(x: number, y: number, target: string): void
  hide(): void
  dispose(): void
}

const HINT_W = 84
const HINT_H = 28

/** One chip reused for whichever prop the prince is close to. */
export function createHint(): HintView {
  ensureStyle()
  const el = document.createElement('p')
  el.className = 'interact-hint'
  el.hidden = true
  el.setAttribute('aria-hidden', 'true')
  document.body.append(el)

  const coarse = window.matchMedia('(pointer: coarse)')
  let label = ''
  let safe: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 }
  const syncLabel = () => {
    const next = coarse.matches ? '轻触' : 'E / 点击'
    if (next === label) return
    label = next
    el.textContent = next
  }
  const refreshSafe = () => {
    safe = readSafeInsets()
  }
  syncLabel()
  refreshSafe()
  coarse.addEventListener('change', syncLabel)
  window.addEventListener('resize', refreshSafe)
  window.addEventListener('orientationchange', refreshSafe)

  return {
    show(x: number, y: number, target: string): void {
      syncLabel()
      if (el.hidden) el.hidden = false
      if (el.dataset.target !== target) el.dataset.target = target
      const box = readViewport()
      const left = clamp(
        x,
        box.left + safe.left + 8 + HINT_W / 2,
        box.left + box.width - safe.right - 8 - HINT_W / 2,
      )
      const top = clamp(y, box.top + safe.top + 8 + HINT_H, box.top + box.height - safe.bottom - 8)
      el.style.left = `${left}px`
      el.style.top = `${top}px`
    },
    hide(): void {
      if (el.hidden) return
      el.hidden = true
      delete el.dataset.target
    },
    dispose(): void {
      coarse.removeEventListener('change', syncLabel)
      window.removeEventListener('resize', refreshSafe)
      window.removeEventListener('orientationchange', refreshSafe)
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
      box-sizing: border-box;
      width: 84px;
      padding: 5px 10px;
      border-radius: 999px;
      text-align: center;
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
