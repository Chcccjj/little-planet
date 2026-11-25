/**
 * One frame of player intent. `read()` overwrites this object; do not keep the reference
 * across frames. Move is camera-relative and clamped to a unit disc. Look and zoom are
 * deltas accumulated since the previous read (pixels, and wheel pixels).
 *
 * x > 0 strafes right, y > 0 walks forward.
 * lookX > 0 is a pointer drag to the right, lookY > 0 is a pointer drag downward.
 * zoom > 0 pulls the camera back.
 */
export interface FrameInput {
  moveX: number
  moveY: number
  lookX: number
  lookY: number
  zoom: number
}

/**
 * A physical source of input. PR 4 can add a virtual joystick (writes move)
 * and a touch-drag look (writes look) without changing locomotion or the camera.
 * `contribute` adds into the frame; it does not replace other drivers.
 */
export interface InputDriver {
  contribute(frame: FrameInput): void
  dispose(): void
}

export interface GameInput {
  read(frame: FrameInput): void
  dispose(): void
}

export function createFrameInput(): FrameInput {
  return { moveX: 0, moveY: 0, lookX: 0, lookY: 0, zoom: 0 }
}
