import { palette } from '../config/palette'

const STYLE_ID = 'webgl-fallback-style'

/** True when the browser can create a WebGL context. Software GL still counts. */
export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    return gl !== null
  } catch {
    return false
  }
}

/**
 * Calm stand-in when the asteroid cannot be drawn. Morandi card, no extra assets.
 */
export function showWebGLFallback(container: HTMLElement): void {
  ensureStyle()
  container.replaceChildren()

  const wrap = document.createElement('div')
  wrap.className = 'webgl-fallback'

  const card = document.createElement('div')
  card.className = 'webgl-fallback-card'

  const title = document.createElement('h1')
  title.textContent = 'B612 暂时看不见'

  const body = document.createElement('p')
  body.textContent = '这颗小行星需要 WebGL 才能转起来。请换一个较新的浏览器，或打开硬件加速后再来。'

  card.append(title, body)
  wrap.append(card)
  container.append(wrap)
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .webgl-fallback {
      min-height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px 20px;
      box-sizing: border-box;
      background: ${palette.hazeBlue};
    }
    .webgl-fallback-card {
      max-width: 26rem;
      padding: 28px 26px 26px;
      border-radius: 18px;
      background: ${palette.offWhite};
      color: #3c424a;
      box-shadow: 0 10px 28px rgba(60, 64, 68, 0.12);
    }
    .webgl-fallback-card h1 {
      margin: 0 0 10px;
      font: 600 22px/1.35 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
      letter-spacing: 0.01em;
    }
    .webgl-fallback-card p {
      margin: 0;
      font: 15px/1.65 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
      color: #526070;
    }
  `
  document.head.appendChild(style)
}
