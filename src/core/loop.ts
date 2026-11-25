export type FrameUpdate = (deltaSeconds: number) => void

const MAX_DELTA_SECONDS = 0.05

/**
 * requestAnimationFrame loop. Delta is capped so a backgrounded tab
 * cannot fling the idle orbit when the page becomes visible again.
 */
export function startLoop(update: FrameUpdate): void {
  let last = performance.now()

  const frame = (now: number) => {
    const dt = Math.min((now - last) / 1000, MAX_DELTA_SECONDS)
    last = now
    update(dt)
    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}
