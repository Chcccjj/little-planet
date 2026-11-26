import { exceedsTapSlop } from './tapMath'

export interface TapPoint {
  clientX: number
  clientY: number
  pointerType: string
}

/**
 * A tap is a primary pointer that lands within a few pixels of where it
 * went down. Mouse drags stay camera-look, and a touch drag is left for
 * the joystick in PR 4 — neither one should fire an interaction.
 */
export function trackTaps(target: HTMLElement, onTap: (tap: TapPoint) => void): () => void {
  const active = new Map<number, { x: number; y: number; dragged: boolean }>()

  const onDown = (event: PointerEvent) => {
    if (!event.isPrimary) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    active.set(event.pointerId, { x: event.clientX, y: event.clientY, dragged: false })
  }

  const onMove = (event: PointerEvent) => {
    const start = active.get(event.pointerId)
    if (!start || start.dragged) return
    if (exceedsTapSlop(event.clientX - start.x, event.clientY - start.y)) {
      start.dragged = true
    }
  }

  const onUp = (event: PointerEvent) => {
    const start = active.get(event.pointerId)
    if (!start) return
    active.delete(event.pointerId)
    if (start.dragged) return
    if (exceedsTapSlop(event.clientX - start.x, event.clientY - start.y)) return
    onTap({
      clientX: event.clientX,
      clientY: event.clientY,
      pointerType: event.pointerType,
    })
  }

  const onCancel = (event: PointerEvent) => {
    active.delete(event.pointerId)
  }

  target.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)

  return () => {
    target.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    active.clear()
  }
}
