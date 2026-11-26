export const TAP_SLOP_PX = 16

/** A pointer that travels farther than the slop is a drag, not a tap. */
export function exceedsTapSlop(dx: number, dy: number, slop = TAP_SLOP_PX): boolean {
  return dx * dx + dy * dy > slop * slop
}
