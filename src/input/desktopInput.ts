import { isMoveCode, keyboardMove, normalizeWheelDelta } from './mapping'
import type { FrameInput, InputDriver } from './types'

/**
 * Keyboard move plus mouse-drag look and wheel zoom.
 * Touch pointers are ignored here; the touch driver owns them.
 */
export function createDesktopInput(target: HTMLElement): InputDriver {
  const keys = new Set<string>()
  let lookX = 0
  let lookY = 0
  let zoom = 0
  let pointerId = -1
  let lastX = 0
  let lastY = 0
  let active = true

  const onKeyDown = (event: KeyboardEvent) => {
    if (!active || event.repeat) return
    if (isMoveCode(event.code)) {
      if (event.code.startsWith('Arrow')) event.preventDefault()
      keys.add(event.code)
    }
  }

  const onKeyUp = (event: KeyboardEvent) => {
    keys.delete(event.code)
  }

  const releaseKeys = () => {
    keys.clear()
    pointerId = -1
  }

  const onPointerDown = (event: PointerEvent) => {
    if (!active || event.pointerType !== 'mouse' || event.button !== 0 || pointerId !== -1) return
    pointerId = event.pointerId
    lastX = event.clientX
    lastY = event.clientY
    try {
      target.setPointerCapture(event.pointerId)
    } catch {
      pointerId = -1
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!active || event.pointerId !== pointerId) return
    lookX += event.clientX - lastX
    lookY += event.clientY - lastY
    lastX = event.clientX
    lastY = event.clientY
  }

  const endPointer = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return
    pointerId = -1
  }

  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    if (!active) return
    zoom += normalizeWheelDelta(event.deltaY, event.deltaMode)
  }

  const onContextMenu = (event: Event) => {
    event.preventDefault()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', releaseKeys)
  target.addEventListener('pointerdown', onPointerDown)
  target.addEventListener('pointermove', onPointerMove)
  target.addEventListener('pointerup', endPointer)
  target.addEventListener('pointercancel', endPointer)
  target.addEventListener('lostpointercapture', endPointer)
  target.addEventListener('wheel', onWheel, { passive: false })
  target.addEventListener('contextmenu', onContextMenu)

  return {
    contribute(frame: FrameInput): void {
      const move = keyboardMove(keys)
      frame.moveX += move.x
      frame.moveY += move.y
      frame.lookX += lookX
      frame.lookY += lookY
      frame.zoom += zoom
      lookX = 0
      lookY = 0
      zoom = 0
    },
    setActive(next: boolean): void {
      active = next
      if (next) return
      keys.clear()
      pointerId = -1
      lookX = 0
      lookY = 0
      zoom = 0
    },
    setWalking(): void {},
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseKeys)
      target.removeEventListener('pointerdown', onPointerDown)
      target.removeEventListener('pointermove', onPointerMove)
      target.removeEventListener('pointerup', endPointer)
      target.removeEventListener('pointercancel', endPointer)
      target.removeEventListener('lostpointercapture', endPointer)
      target.removeEventListener('wheel', onWheel)
      target.removeEventListener('contextmenu', onContextMenu)
    },
  }
}

