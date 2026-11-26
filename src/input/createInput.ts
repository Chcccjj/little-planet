import { createDesktopInput } from './desktopInput'
import { clampToUnitDisc } from './mapping'
import { createTouchInput } from './touchInput'
import { createFrameInput, type FrameInput, type GameInput, type InputDriver } from './types'

export { createFrameInput }
export type { FrameInput, GameInput, InputDriver }

/**
 * Composes input drivers into one frame.
 * Keyboard, mouse, and the touch joystick all add into the same move and look.
 * Locomotion only sees `read()`.
 */
export function createInput(target: HTMLElement): GameInput {
  return combineDrivers([createDesktopInput(target), createTouchInput(target)])
}

/** Sum every driver into one frame and clamp the move onto the unit disc. */
export function combineDrivers(drivers: readonly InputDriver[]): GameInput {
  return {
    read(frame: FrameInput): void {
      frame.moveX = 0
      frame.moveY = 0
      frame.lookX = 0
      frame.lookY = 0
      frame.zoom = 0
      for (let i = 0; i < drivers.length; i++) drivers[i].contribute(frame)
      const clamped = clampToUnitDisc(frame.moveX, frame.moveY)
      frame.moveX = clamped.x
      frame.moveY = clamped.y
    },
    setActive(active: boolean): void {
      for (let i = 0; i < drivers.length; i++) drivers[i].setActive(active)
    },
    setWalking(enabled: boolean): void {
      for (let i = 0; i < drivers.length; i++) drivers[i].setWalking(enabled)
    },
    dispose(): void {
      for (let i = 0; i < drivers.length; i++) drivers[i].dispose()
    },
  }
}
