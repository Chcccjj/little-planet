export interface PixelRatioInput {
  devicePixelRatio: number
  coarsePointer: boolean
  hardwareConcurrency: number
  /** Chrome-only hint, in gigabytes. Absent on Safari. */
  deviceMemory?: number
  viewportWidth: number
  viewportHeight: number
}

export interface ViewportBox {
  left: number
  top: number
  width: number
  height: number
}

export interface SafeInsets {
  top: number
  right: number
  bottom: number
  left: number
}

const TABLET_PIXELS = 700 * 900

/**
 * Desktop stays at most 2. A coarse pointer starts at 1.5, drops to 1.25 on a
 * large viewport or a memory-constrained device, and to 1 on a very small CPU
 * or 2 GB of RAM. The device's own ratio is never exceeded.
 */
export function choosePixelRatio(input: PixelRatioInput): number {
  const dpr =
    Number.isFinite(input.devicePixelRatio) && input.devicePixelRatio > 0 ? input.devicePixelRatio : 1
  if (!input.coarsePointer) return Math.min(dpr, 2)

  const cores = input.hardwareConcurrency > 0 ? input.hardwareConcurrency : 8
  const pixels = Math.max(0, input.viewportWidth) * Math.max(0, input.viewportHeight)
  const memory = input.deviceMemory
  let cap = 1.5
  if (pixels >= TABLET_PIXELS || (memory !== undefined && memory <= 3)) cap = 1.25
  if (cores <= 2 || (memory !== undefined && memory <= 2)) cap = 1
  return Math.min(dpr, cap)
}

export function readDeviceMemory(): number | undefined {
  const value = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function currentPixelRatio(): number {
  const box = readViewport()
  return choosePixelRatio({
    devicePixelRatio: window.devicePixelRatio || 1,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    hardwareConcurrency: navigator.hardwareConcurrency || 8,
    deviceMemory: readDeviceMemory(),
    viewportWidth: box.width,
    viewportHeight: box.height,
  })
}

/**
 * One-way pixel-ratio step used when a device cannot hold the frame budget.
 * `averageFps` below 28 steps down by 0.25, and never below `floor`.
 */
export function stepDownPixelRatio(current: number, averageFps: number, floor = 1): number {
  if (!(averageFps < 28) || !(current > floor)) return current
  const next = Math.round((current - 0.25) * 100) / 100
  return Math.max(floor, next)
}

/**
 * Watches frame timestamps and lowers the pixel ratio after a 2s warmup when
 * two consecutive half-second windows stay under 28 fps. At most four steps,
 * so a desktop cap of 2 can reach 1 and then stops. The ratio never climbs back.
 */
export class PixelRatioAdaptor {
  private last = -1
  private frames = 0
  private elapsed = 0
  private warmed = 0
  private strikes = 0
  private drops = 0

  constructor(
    public ratio: number,
    private readonly floor = 1,
  ) {}

  push(nowMs: number): number {
    if (this.last < 0) {
      this.last = nowMs
      return this.ratio
    }
    const dt = Math.max(0, Math.min(0.25, (nowMs - this.last) / 1000))
    this.last = nowMs
    if (this.drops >= 4) return this.ratio
    this.warmed += dt
    if (this.warmed < 2) return this.ratio
    this.frames += 1
    this.elapsed += dt
    if (this.elapsed < 0.5) return this.ratio
    const fps = this.frames / this.elapsed
    this.frames = 0
    this.elapsed = 0
    if (fps >= 28) {
      this.strikes = 0
      return this.ratio
    }
    this.strikes += 1
    if (this.strikes < 2) return this.ratio
    this.strikes = 0
    const next = stepDownPixelRatio(this.ratio, fps, this.floor)
    if (next < this.ratio) this.drops += 1
    this.ratio = next
    return this.ratio
  }
}

export function readViewport(): ViewportBox {
  const visual = window.visualViewport
  if (visual) {
    return {
      left: visual.offsetLeft,
      top: visual.offsetTop,
      width: Math.max(1, Math.round(visual.width)),
      height: Math.max(1, Math.round(visual.height)),
    }
  }
  return {
    left: 0,
    top: 0,
    width: Math.max(1, Math.round(window.innerWidth)),
    height: Math.max(1, Math.round(window.innerHeight)),
  }
}

/** Pin the stage to the visual viewport so the URL bar cannot scroll the page. */
export function fitApp(container: HTMLElement): ViewportBox {
  const box = readViewport()
  const style = container.style
  style.position = 'fixed'
  style.left = `${box.left}px`
  style.top = `${box.top}px`
  style.width = `${box.width}px`
  style.height = `${box.height}px`
  return box
}

export function readSafeInsets(): SafeInsets {
  const style = getComputedStyle(document.documentElement)
  const px = (name: string) => {
    const value = Number.parseFloat(style.getPropertyValue(name))
    return Number.isFinite(value) ? value : 0
  }
  return {
    top: px('--safe-top'),
    right: px('--safe-right'),
    bottom: px('--safe-bottom'),
    left: px('--safe-left'),
  }
}

/** Resize, rotation, and moving between screens. The callback runs once per frame. */
export function watchViewport(onChange: () => void): () => void {
  let queued = 0
  const schedule = () => {
    if (queued) return
    queued = requestAnimationFrame(() => {
      queued = 0
      onChange()
    })
  }

  window.addEventListener('resize', schedule)
  window.addEventListener('orientationchange', schedule)
  const visual = window.visualViewport
  visual?.addEventListener('resize', schedule)
  visual?.addEventListener('scroll', schedule)

  let dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  const onDpr = () => {
    dprQuery.removeEventListener('change', onDpr)
    schedule()
    dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    dprQuery.addEventListener('change', onDpr)
  }
  dprQuery.addEventListener('change', onDpr)

  const coarse = window.matchMedia('(pointer: coarse)')
  coarse.addEventListener('change', schedule)

  return () => {
    if (queued) cancelAnimationFrame(queued)
    window.removeEventListener('resize', schedule)
    window.removeEventListener('orientationchange', schedule)
    visual?.removeEventListener('resize', schedule)
    visual?.removeEventListener('scroll', schedule)
    dprQuery.removeEventListener('change', onDpr)
    coarse.removeEventListener('change', schedule)
  }
}
