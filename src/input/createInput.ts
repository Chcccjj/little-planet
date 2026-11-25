import { createDesktopInput } from './desktopInput'
import { createFrameInput, type FrameInput, type GameInput, type InputDriver } from './types'

export { createFrameInput }
export type { FrameInput, GameInput, InputDriver }

/**
 * Composes input drivers into one frame.
 * Desktop keys and mouse are the only driver today. A virtual joystick and
 * touch-drag look drop in as extra InputDrivers — locomotion only sees `read()`.
 */
export function createInput(target: HTMLElement): GameInput {
  const drivers: InputDriver[] = [createDesktopInput(target)]

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
    dispose(): void {
      for (let i = 0; i < drivers.length; i++) drivers[i].dispose()
    },
  }
}
