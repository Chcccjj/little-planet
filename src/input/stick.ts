/** Knob travel as a fraction of the base diameter. */
export const STICK_TRAVEL = 0.32
export const STICK_DEADZONE = 0.14

export interface StickAxes {
  /** Strafe, right positive. Already divided by the travel radius. */
  x: number
  /** Forward, up positive (screen-down is negative). */
  y: number
  knobX: number
  knobY: number
}

/**
 * Map a pointer offset from the stick center into a unit move and a knob
 * translation. Offsets past the rim are clamped. Inside the deadzone the
 * knob still follows the finger, but the move is zero.
 */
export function stickAxes(
  dx: number,
  dy: number,
  width: number,
  travel = STICK_TRAVEL,
  deadzone = STICK_DEADZONE,
): StickAxes {
  const max = Math.max(width * travel, 1)
  let x = dx
  let y = dy
  let len = Math.hypot(x, y)
  if (len > max && len > 0) {
    const scale = max / len
    x *= scale
    y *= scale
    len = max
  }
  if (len < max * deadzone) return { x: 0, y: 0, knobX: x, knobY: y }
  return { x: x / max, y: -y / max, knobX: x, knobY: y }
}
