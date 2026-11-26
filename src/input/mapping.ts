/** Fold a key pair into -1, 0, or 1. Opposite keys cancel. */
export function axis(positive: boolean, negative: boolean): number {
  return (positive ? 1 : 0) - (negative ? 1 : 0)
}

export function isMoveCode(code: string): boolean {
  return (
    code === 'KeyW' ||
    code === 'KeyA' ||
    code === 'KeyS' ||
    code === 'KeyD' ||
    code === 'ArrowUp' ||
    code === 'ArrowDown' ||
    code === 'ArrowLeft' ||
    code === 'ArrowRight'
  )
}

/** Camera-relative stick from the keys that are currently down. */
export function keyboardMove(codes: ReadonlySet<string>): { x: number; y: number } {
  return {
    x: axis(codes.has('KeyD') || codes.has('ArrowRight'), codes.has('KeyA') || codes.has('ArrowLeft')),
    y: axis(codes.has('KeyW') || codes.has('ArrowUp'), codes.has('KeyS') || codes.has('ArrowDown')),
  }
}

/** DOM_DELTA_LINE. Pixels per reported line, so a notch feels the same across browsers. */
export const WHEEL_LINE_PX = 16
/** DOM_DELTA_PAGE. */
export const WHEEL_PAGE_PX = 400

export function normalizeWheelDelta(deltaY: number, deltaMode: number): number {
  if (deltaMode === 1) return deltaY * WHEEL_LINE_PX
  if (deltaMode === 2) return deltaY * WHEEL_PAGE_PX
  return deltaY
}

/** Keep a summed move vector inside the unit disc. */
export function clampToUnitDisc(x: number, y: number): { x: number; y: number } {
  const lenSq = x * x + y * y
  if (lenSq <= 1) return { x, y }
  const inv = 1 / Math.sqrt(lenSq)
  return { x: x * inv, y: y * inv }
}
