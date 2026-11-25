import type { FrameInput, InputDriver } from './types'

/**
 * Keyboard move plus mouse-drag look and wheel zoom.
 * Touch pointers are ignored on purpose: PR 4 supplies those through InputDriver.
 */
export function createDesktopInput(target: HTMLElement): InputDriver {
  const keys = new Set<string>()
  let lookX = 0
  let lookY = 0
  let zoom = 0
  let pointerId = -1
  let lastX = 0
  let lastY = 0

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) return
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
    if (event.pointerType !== 'mouse' || event.button !== 0 || pointerId !== -1) return
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
    if (event.pointerId !== pointerId) return
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
    zoom += normalizeWheel(event)
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
      frame.moveX += axis(keys.has('KeyD') || keys.has('ArrowRight'), keys.has('KeyA') || keys.has('ArrowLeft'))
      frame.moveY += axis(keys.has('KeyW') || keys.has('ArrowUp'), keys.has('KeyS') || keys.has('ArrowDown'))
      frame.lookX += lookX
      frame.lookY += lookY
      frame.zoom += zoom
      lookX = 0
      lookY = 0
      zoom = 0
    },
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

function axis(positive: boolean, negative: boolean): number {
  return (positive ? 1 : 0) - (negative ? 1 : 0)
}

function isMoveCode(code: string): boolean {
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

/** Fold line/page wheel modes into pixels so a notch feels the same across browsers. */
function normalizeWheel(event: WheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * 400
  return event.deltaY
}
