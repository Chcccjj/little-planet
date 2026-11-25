import { createDesktopInput } from './desktopInput'
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
  const drivers: InputDriver[] = [createDesktopInput(target), createTouchInput(target)]

  return {
    read(frame: FrameInput): void {
      frame.moveX = 0
      frame.moveY = 0
      frame.lookX = 0
      frame.lookY = 0
      frame.zoom = 0
      for (let i = 0; i < drivers.length; i++) drivers[i].contribute(frame)
      const lenSq = frame.moveX * frame.moveX + frame.moveY * frame.moveY
      if (lenSq > 1) {
        const inv = 1 / Math.sqrt(lenSq)
        frame.moveX *= inv
        frame.moveY *= inv
      }
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
