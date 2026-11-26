export type FrameUpdate = (deltaSeconds: number) => void

export interface GameLoop {
  stop(): void
}

const MAX_DELTA_SECONDS = 0.05

/**
 * requestAnimationFrame loop. Delta is capped so a backgrounded tab
 * cannot fling the prince across the asteroid when the page becomes visible again.
 * `stop` ends the loop for good (WebGL context lost). Pausing is the caller's job:
 * keep scheduling frames and skip the simulation, so a title orbit can still turn.
 */
export function startLoop(update: FrameUpdate): GameLoop {
  let alive = true
  let last = performance.now()

  const frame = (now: number) => {
    if (!alive) return
    const dt = Math.min((now - last) / 1000, MAX_DELTA_SECONDS)
    last = now
    update(dt)
    if (!alive) return
    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
  return {
    stop(): void {
      alive = false
    },
  }
}
