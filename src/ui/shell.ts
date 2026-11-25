import { palette } from '../config/palette'

export type ShellMode = 'title' | 'play' | 'paused'

export interface TitleInfo {
  hasSave: boolean
  discovered: number
  total: number
  sunsetViews: number
}

export interface GameShell {
  setTitle(info: TitleInfo): void
  setMode(mode: ShellMode): void
  setSound(on: boolean): void
  dispose(): void
}

const FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "PingFang SC", "Noto Sans SC", "Segoe UI", sans-serif'

/**
 * Title card and pause sheet. DOM only, so they cost no draw calls.
 * The planet behind the title is the live scene, orbited by the caller.
 */
export function createShell(handlers: {
  onPlay: () => void
  onRestart: () => void
  onResume: () => void
  onTitle: () => void
  onPause: () => void
  onSound: (on: boolean) => void
}): GameShell {
  ensureStyle()

  const title = document.createElement('section')
  title.className = 'title-screen'
  title.dataset.screen = 'title'
  title.setAttribute('aria-label', '开始')

  const eyebrow = document.createElement('p')
  eyebrow.className = 'menu-eyebrow'
  eyebrow.textContent = 'B612'

  const heading = document.createElement('h1')
  heading.className = 'title-name'
  heading.textContent = '小星球'

  const subtitle = document.createElement('p')
  subtitle.className = 'title-sub'
  subtitle.textContent = '一颗刚好能走完的小行星。雾是浅的，话也是。'

  const progress = document.createElement('p')
  progress.className = 'title-progress'
  progress.dataset.progress = 'true'
  progress.hidden = true

  const titleActions = document.createElement('div')
  titleActions.className = 'menu-actions'

  const help = document.createElement('div')
  help.className = 'title-help'
  const desk = document.createElement('p')
  desk.textContent = '电脑 · WASD 行走，拖动环顾，E 对话'
  const phone = document.createElement('p')
  phone.textContent = '手机 · 摇杆行走，拖动环顾，轻触对话'
  help.append(desk, phone)
  title.append(eyebrow, heading, subtitle, progress, titleActions, help)

  const pauseButton = document.createElement('button')
  pauseButton.type = 'button'
  pauseButton.className = 'pause-button'
  pauseButton.dataset.action = 'pause'
  pauseButton.setAttribute('aria-label', '暂停')
  pauseButton.hidden = true
  pauseButton.innerHTML =
    '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="3.15" y="2.2" width="3.1" height="11.6" rx="1.1"></rect><rect x="9.75" y="2.2" width="3.1" height="11.6" rx="1.1"></rect></svg>'

  const pause = document.createElement('section')
  pause.className = 'pause-screen'
  pause.dataset.screen = 'pause'
  pause.hidden = true
  pause.setAttribute('role', 'dialog')
  pause.setAttribute('aria-modal', 'true')
  pause.setAttribute('aria-label', '暂停')

  const card = document.createElement('div')
  card.className = 'pause-card'
  const pauseEyebrow = document.createElement('p')
  pauseEyebrow.className = 'menu-eyebrow'
  pauseEyebrow.textContent = '暂停'
  const pauseTitle = document.createElement('h2')
  pauseTitle.className = 'pause-name'
  pauseTitle.textContent = '先停在这里'
  const pauseActions = document.createElement('div')
  pauseActions.className = 'menu-actions'

  const resume = button('继续', 'resume', false)
  const back = button('回到开始界面', 'title', true)
  const sound = document.createElement('button')
  sound.type = 'button'
  sound.className = 'sound-row'
  sound.dataset.action = 'sound'
  sound.setAttribute('role', 'switch')
  sound.setAttribute('aria-checked', 'true')
  const soundLabel = document.createElement('span')
  soundLabel.textContent = '音效'
  const soundKnob = document.createElement('span')
  soundKnob.className = 'sound-switch'
  soundKnob.setAttribute('aria-hidden', 'true')
  sound.append(soundLabel, soundKnob)

  pauseActions.append(resume, back, sound)
  card.append(pauseEyebrow, pauseTitle, pauseActions)
  pause.append(card)

  document.body.append(title, pauseButton, pause)

  let mode: ShellMode = 'title'
  let soundOn = true

  const paintTitle = (info: TitleInfo) => {
    titleActions.replaceChildren()
    if (info.hasSave) {
      titleActions.append(actionButton('继续', 'play', false, handlers.onPlay))
      titleActions.append(actionButton('重新开始', 'restart', true, handlers.onRestart))
      const seen = info.sunsetViews > 0 ? ` · 看过 ${info.sunsetViews} 次日落` : ''
      progress.hidden = false
      progress.textContent = `已发现 ${info.discovered}/${info.total}${seen}`
    } else {
      titleActions.append(actionButton('开始', 'play', false, handlers.onPlay))
      progress.hidden = true
      progress.textContent = ''
    }
  }

  const applyMode = (next: ShellMode) => {
    mode = next
    title.hidden = next !== 'title'
    pause.hidden = next !== 'paused'
    pauseButton.hidden = next !== 'play'
    title.setAttribute('aria-hidden', next === 'title' ? 'false' : 'true')
    pause.setAttribute('aria-hidden', next === 'paused' ? 'false' : 'true')
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.repeat || event.code !== 'Escape') return
    if (mode === 'play') {
      event.preventDefault()
      handlers.onPause()
      return
    }
    if (mode === 'paused') {
      event.preventDefault()
      handlers.onResume()
    }
  }

  pauseButton.addEventListener('click', () => {
    if (mode === 'play') handlers.onPause()
  })
  resume.addEventListener('click', () => handlers.onResume())
  back.addEventListener('click', () => handlers.onTitle())
  sound.addEventListener('click', () => {
    soundOn = !soundOn
    paintSound()
    handlers.onSound(soundOn)
  })
  window.addEventListener('keydown', onKey)

  return {
    setTitle: paintTitle,
    setMode: applyMode,
    setSound(on: boolean): void {
      soundOn = on
      paintSound()
    },
    dispose(): void {
      window.removeEventListener('keydown', onKey)
      title.remove()
      pauseButton.remove()
      pause.remove()
    },
  }

  function paintSound(): void {
    sound.setAttribute('aria-checked', soundOn ? 'true' : 'false')
  }
}

function actionButton(label: string, action: string, secondary: boolean, onClick: () => void): HTMLButtonElement {
  const el = button(label, action, secondary)
  el.addEventListener('click', onClick)
  return el
}

function button(label: string, action: string, secondary: boolean): HTMLButtonElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = secondary ? 'menu-button secondary' : 'menu-button'
  el.dataset.action = action
  el.textContent = label
  return el
}

function ensureStyle(): void {
  if (document.getElementById('shell-style')) return
  const style = document.createElement('style')
  style.id = 'shell-style'
  style.textContent = `
    .title-screen,
    .pause-screen,
    .pause-button,
    .menu-button,
    .sound-row {
      font-family: ${FONT};
      color: ${palette.ink};
      -webkit-tap-highlight-color: transparent;
    }
    .title-screen {
      position: fixed;
      inset: 0;
      z-index: 8;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      box-sizing: border-box;
      padding:
        calc(24px + env(safe-area-inset-top))
        calc(28px + env(safe-area-inset-right))
        calc(36px + env(safe-area-inset-bottom))
        calc(28px + env(safe-area-inset-left));
      background: linear-gradient(
        to top,
        rgba(242, 239, 233, 0.94) 0%,
        rgba(242, 239, 233, 0.82) 28%,
        rgba(242, 239, 233, 0.28) 52%,
        rgba(242, 239, 233, 0) 70%
      );
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    .title-screen[hidden],
    .pause-screen[hidden],
    .pause-button[hidden] {
      display: none !important;
    }
    .menu-eyebrow {
      margin: 0 0 8px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #7d868f;
    }
    .title-name {
      margin: 0;
      font-size: clamp(44px, 8vw, 68px);
      font-weight: 560;
      letter-spacing: 0.04em;
      line-height: 1.05;
    }
    .title-sub {
      max-width: 22em;
      margin: 12px 0 0;
      font-size: 16px;
      font-weight: 400;
      line-height: 1.6;
    }
    .title-progress {
      margin: 14px 0 0;
      font-size: 12px;
      letter-spacing: 0.04em;
      color: #7d868f;
    }
    .title-progress[hidden] {
      display: none !important;
    }
    .menu-actions {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
      margin-top: 22px;
    }
    .menu-button {
      appearance: none;
      width: min(280px, 100%);
      height: 48px;
      padding: 0 22px;
      border: 0;
      border-radius: 980px;
      background: ${palette.hazeBlue};
      color: ${palette.offWhite};
      font-size: 16px;
      font-weight: 560;
      letter-spacing: 0.04em;
      cursor: pointer;
    }
    .menu-button.secondary {
      background: transparent;
      color: ${palette.ink};
      box-shadow: inset 0 0 0 1px rgba(92, 101, 110, 0.28);
    }
    .title-help {
      margin-top: 22px;
      font-size: 12px;
      line-height: 1.55;
      letter-spacing: 0.01em;
      color: #7d868f;
    }
    .title-help p {
      margin: 0;
    }
    .pause-button {
      position: fixed;
      z-index: 5;
      top: calc(14px + env(safe-area-inset-top));
      right: calc(14px + env(safe-area-inset-right));
      width: 40px;
      height: 40px;
      display: grid;
      place-items: center;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: rgba(242, 239, 233, 0.78);
      color: ${palette.ink};
      box-shadow: 0 1px 2px rgba(60, 64, 68, 0.12);
      cursor: pointer;
      touch-action: none;
    }
    .pause-button svg {
      display: block;
      fill: currentColor;
    }
    .pause-screen {
      position: fixed;
      inset: 0;
      z-index: 7;
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      padding:
        calc(24px + env(safe-area-inset-top))
        calc(20px + env(safe-area-inset-right))
        calc(24px + env(safe-area-inset-bottom))
        calc(20px + env(safe-area-inset-left));
      background: rgba(143, 163, 184, 0.32);
      backdrop-filter: blur(18px) saturate(1.05);
      -webkit-backdrop-filter: blur(18px) saturate(1.05);
      touch-action: none;
    }
    .pause-card {
      width: min(320px, 100%);
      box-sizing: border-box;
      padding: 26px 22px 22px;
      border-radius: 22px;
      background: ${palette.offWhite};
      box-shadow: 0 16px 40px rgba(70, 74, 82, 0.12);
    }
    .pause-name {
      margin: 0;
      font-size: 28px;
      font-weight: 560;
      letter-spacing: 0.03em;
      line-height: 1.2;
    }
    .pause-card .menu-actions {
      align-items: stretch;
    }
    .pause-card .menu-button {
      width: 100%;
    }
    .sound-row {
      appearance: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      height: 48px;
      margin-top: 4px;
      padding: 0 16px 0 18px;
      border: 0;
      border-radius: 14px;
      background: rgba(184, 190, 198, 0.32);
      font-size: 15px;
      font-weight: 500;
      letter-spacing: 0.02em;
      cursor: pointer;
    }
    .sound-switch {
      position: relative;
      width: 40px;
      height: 24px;
      border-radius: 999px;
      background: rgba(143, 163, 184, 0.45);
    }
    .sound-switch::after {
      content: "";
      position: absolute;
      top: 3px;
      left: 3px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: ${palette.offWhite};
      transition: transform 160ms ease;
    }
    .sound-row[aria-checked="true"] .sound-switch {
      background: ${palette.hazeBlue};
    }
    .sound-row[aria-checked="true"] .sound-switch::after {
      transform: translateX(16px);
    }
  `
  document.head.appendChild(style)
}
