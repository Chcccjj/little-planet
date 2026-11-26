import type { WebGLRenderer } from 'three'

export interface PerfPanel {
  update(): void
  dispose(): void
}

const SAMPLE_MS = 400

/**
 * Dev-only readout of FPS, draw calls, and triangles.
 * Production builds fold this away because `import.meta.env.DEV` is false.
 */
export function createPerfPanel(renderer: WebGLRenderer): PerfPanel {
  if (!import.meta.env.DEV) {
    return {
      update() {},
      dispose() {},
    }
  }
  return mountPerfPanel(renderer)
}

function mountPerfPanel(renderer: WebGLRenderer): PerfPanel {
  ensureStyle()

  const panel = document.createElement('p')
  panel.className = 'perf-panel'
  panel.setAttribute('aria-hidden', 'true')
  panel.textContent = '– fps\n– calls\n– tris'
  document.body.appendChild(panel)

  let frames = 0
  let elapsed = 0
  let last = performance.now()

  return {
    update() {
      const now = performance.now()
      frames += 1
      elapsed += now - last
      last = now
      if (elapsed < SAMPLE_MS) return

      const fps = Math.round((frames * 1000) / elapsed)
      const { calls, triangles } = renderer.info.render
      panel.textContent = `${fps} fps\n${calls} calls\n${triangles.toLocaleString('en-US')} tris`
      frames = 0
      elapsed = 0
    },
    dispose() {
      panel.remove()
    },
  }
}

function ensureStyle(): void {
  if (document.getElementById('perf-panel-style')) return
  const style = document.createElement('style')
  style.id = 'perf-panel-style'
  style.textContent = `
    .perf-panel {
      position: fixed;
      top: 12px;
      left: 12px;
      z-index: 2;
      margin: 0;
      padding: 7px 10px;
      border-radius: 10px;
      background: rgba(242, 239, 233, 0.78);
      color: rgba(52, 56, 62, 0.86);
      font: 11px/1.45 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
      font-variant-numeric: tabular-nums;
      letter-spacing: 0.01em;
      white-space: pre;
      backdrop-filter: blur(16px) saturate(1.15);
      -webkit-backdrop-filter: blur(16px) saturate(1.15);
      box-shadow: 0 1px 2px rgba(60, 64, 68, 0.1);
      pointer-events: none;
      user-select: none;
    }
  `
  document.head.appendChild(style)
}
