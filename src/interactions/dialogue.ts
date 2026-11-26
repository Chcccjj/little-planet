import { palette } from '../config/palette'
import {
  advanceDialogue,
  closeDialogue,
  createDialogueMachine,
  dialogueLine,
  dialogueTyping,
  openDialogue,
  tickDialogue,
} from './dialogueMachine'
import { trackTaps } from './pointerTap'

export interface DialogueSnapshot {
  open: boolean
  page: number
  pages: number
  text: string
  full: string
  typing: boolean
}

export interface DialogueView {
  readonly isOpen: boolean
  open(pages: readonly string[]): void
  /** Finish the current sentence, then turn the page, then close. */
  advance(): void
  close(): void
  update(dt: number): void
  snapshot(): DialogueSnapshot
  dispose(): void
}

/**
 * One sentence per page. A tap or key while the letters are still arriving
 * finishes the sentence instead of skipping it.
 */
export function createDialogue(onAdvance: (via: string) => void): DialogueView {
  ensureStyle()

  const root = document.createElement('div')
  root.className = 'dialogue'
  root.hidden = true
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', '对话')

  const card = document.createElement('div')
  card.className = 'dialogue-card'

  const text = document.createElement('p')
  text.className = 'dialogue-text'

  const cue = document.createElement('p')
  cue.className = 'dialogue-cue'

  card.append(text, cue)
  root.append(card)
  document.body.append(root)

  const state = createDialogueMachine()

  const sync = () => {
    const open = state.open
    root.hidden = !open
    root.dataset.open = open ? 'true' : 'false'
    root.dataset.page = String(state.page)
    root.dataset.typing = dialogueTyping(state) ? 'true' : 'false'
    root.setAttribute('aria-hidden', open ? 'false' : 'true')
    if (!open) {
      text.textContent = ''
      cue.textContent = ''
      return
    }
    const line = dialogueLine(state)
    text.textContent = line.slice(0, state.shown)
    if (state.shown < line.length) cue.textContent = '轻触看全句'
    else if (state.page < state.pages.length - 1) cue.textContent = '轻触继续'
    else cue.textContent = '轻触关上'
  }

  const view: DialogueView = {
    get isOpen() {
      return state.open
    },
    open(next: readonly string[]): void {
      if (next.length === 0) return
      openDialogue(state, next)
      sync()
    },
    advance(): void {
      if (!state.open) return
      advanceDialogue(state)
      sync()
    },
    close(): void {
      if (!state.open) return
      closeDialogue(state)
      sync()
    },
    update(dt: number): void {
      if (tickDialogue(state, dt)) sync()
    },
    snapshot(): DialogueSnapshot {
      return {
        open: state.open,
        page: state.page,
        pages: state.pages.length,
        text: text.textContent ?? '',
        full: dialogueLine(state),
        typing: dialogueTyping(state),
      }
    },
    dispose(): void {
      stopTaps()
      root.remove()
    },
  }

  const stopTaps = trackTaps(root, (tap) => {
    if (!state.open) return
    onAdvance(tap.pointerType)
    view.advance()
  })

  return view
}

function ensureStyle(): void {
  if (document.getElementById('dialogue-style')) return
  const style = document.createElement('style')
  style.id = 'dialogue-style'
  style.textContent = `
    .dialogue {
      position: fixed;
      inset: 0;
      z-index: 4;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      box-sizing: border-box;
      padding:
        calc(12px + env(safe-area-inset-top))
        calc(16px + env(safe-area-inset-right))
        calc(18px + env(safe-area-inset-bottom))
        calc(16px + env(safe-area-inset-left));
      background: transparent;
      touch-action: none;
      -webkit-tap-highlight-color: transparent;
    }
    .dialogue[hidden] {
      display: none !important;
    }
    .dialogue-card {
      width: min(440px, 100%);
      max-height: calc(100% - 8px);
      overflow: auto;
      box-sizing: border-box;
      padding: 22px 22px 16px;
      border-radius: 22px;
      background: ${palette.offWhite};
      color: ${palette.ink};
      box-shadow: 0 12px 36px rgba(70, 74, 82, 0.14);
      font: 17px/1.7 -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Noto Sans SC", "Segoe UI", sans-serif;
      letter-spacing: 0.01em;
      user-select: none;
      -webkit-user-select: none;
      cursor: pointer;
      touch-action: pan-y;
    }
    @media (max-width: 380px), (max-height: 430px) {
      .dialogue-card {
        padding: 16px 16px 12px;
        font-size: 16px;
      }
    }
    .dialogue-text {
      min-height: 3.4em;
      margin: 0;
    }
    .dialogue-cue {
      margin: 12px 0 0;
      text-align: right;
      font-size: 12px;
      line-height: 1.4;
      letter-spacing: 0.06em;
      color: ${palette.cue};
    }
  `
  document.head.appendChild(style)
}
