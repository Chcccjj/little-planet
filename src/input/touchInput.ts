import { stickAxes } from './stick'
import type { FrameInput, InputDriver } from './types'

const STICK_PX = 118

interface Point {
  x: number
  y: number
}

/**
 * Touch UI is for coarse pointers and for browsers that report a touch
 * digitizer. A desktop mouse stays on the keyboard driver, with no joystick.
 */
function prefersTouchControls(): boolean {
  if (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) return true
  return window.matchMedia('(pointer: coarse)').matches
}

/**
 * Fixed joystick in the lower left, one-finger look everywhere else on the
 * canvas, and an optional pinch. Pointers are tracked by id so a thumb can
 * walk while another finger turns the view. Taps stay with the interaction
 * tracker: this driver only accumulates drag pixels, and a short tap is a
 * near-zero look delta.
 */
export function createTouchInput(target: HTMLElement): InputDriver {
  if (!prefersTouchControls()) {
    return {
      contribute() {},
      setActive() {},
      setWalking() {},
      dispose() {},
    }
  }
  return mountTouch(target)
}

function mountTouch(target: HTMLElement): InputDriver {
  ensureStyle()

  const root = document.createElement('div')
  root.className = 'joystick'
  root.dataset.joystick = 'true'
  root.setAttribute('aria-hidden', 'true')
  root.hidden = true

  const knob = document.createElement('div')
  knob.className = 'joystick-knob'
  root.append(knob)
  document.body.append(root)

  const points = new Map<number, Point>()
  let active = false
  let walking = true
  let stickId = -1
  let lookId = -1
  let pinchId = -1
  let lastLookX = 0
  let lastLookY = 0
  let lastPinch = 0
  let moveX = 0
  let moveY = 0
  let lookX = 0
  let lookY = 0
  let zoom = 0

  const resetStick = () => {
    stickId = -1
    moveX = 0
    moveY = 0
    knob.style.transform = 'translate(0px, 0px)'
  }

  const releaseStick = () => {
    const id = stickId
    resetStick()
    if (id < 0) return
    try {
      if (root.hasPointerCapture(id)) root.releasePointerCapture(id)
    } catch {
      // The pointer already ended.
    }
  }

  const syncStick = () => {
    root.hidden = !active || !walking
  }

  const placeStick = (clientX: number, clientY: number) => {
    const rect = root.getBoundingClientRect()
    const axes = stickAxes(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2), rect.width)
    knob.style.transform = `translate(${axes.knobX}px, ${axes.knobY}px)`
    moveX = axes.x
    moveY = axes.y
  }

  const pinchSpan = (): number => {
    if (lookId < 0 || pinchId < 0) return 0
    const a = points.get(lookId)
    const b = points.get(pinchId)
    if (!a || !b) return 0
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  const samplePinch = () => {
    const span = pinchSpan()
    if (span <= 0) return
    if (lastPinch > 0) zoom += lastPinch - span
    lastPinch = span
  }

  const onStickDown = (event: PointerEvent) => {
    if (!active || !walking || stickId !== -1) return
    if (event.pointerType === 'mouse') return
    event.preventDefault()
    event.stopPropagation()
    stickId = event.pointerId
    try {
      root.setPointerCapture(event.pointerId)
    } catch {
      stickId = -1
      return
    }
    placeStick(event.clientX, event.clientY)
  }

  const onStickMove = (event: PointerEvent) => {
    if (event.pointerId !== stickId) return
    event.preventDefault()
    if (!active) return
    placeStick(event.clientX, event.clientY)
  }

  const onStickEnd = (event: PointerEvent) => {
    if (event.pointerId !== stickId) return
    resetStick()
  }

  const onCanvasDown = (event: PointerEvent) => {
    // Touch only. Mouse clicks and the dialogue buttons must keep their default.
    if (event.pointerType === 'touch') event.preventDefault()
    if (!active || event.pointerType === 'mouse') return
    points.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (lookId < 0) {
      lookId = event.pointerId
      lastLookX = event.clientX
      lastLookY = event.clientY
      try {
        target.setPointerCapture(event.pointerId)
      } catch {
        lookId = -1
        points.delete(event.pointerId)
      }
      return
    }
    if (pinchId < 0) {
      pinchId = event.pointerId
      lastPinch = pinchSpan()
    }
  }

  const onCanvasMove = (event: PointerEvent) => {
    const point = points.get(event.pointerId)
    if (!point) return
    point.x = event.clientX
    point.y = event.clientY
    if (!active) return
    if (event.pointerId === lookId) {
      lookX += event.clientX - lastLookX
      lookY += event.clientY - lastLookY
      lastLookX = event.clientX
      lastLookY = event.clientY
      if (pinchId >= 0) samplePinch()
      return
    }
    if (event.pointerId === pinchId) samplePinch()
  }

  const onCanvasEnd = (event: PointerEvent) => {
    const id = event.pointerId
    points.delete(id)
    if (id === pinchId) {
      pinchId = -1
      lastPinch = 0
      return
    }
    if (id !== lookId) return
    lookId = -1
    lastPinch = 0
    if (pinchId < 0) return
    const next = points.get(pinchId)
    lookId = pinchId
    pinchId = -1
    if (!next) {
      lookId = -1
      return
    }
    lastLookX = next.x
    lastLookY = next.y
  }

  root.addEventListener('pointerdown', onStickDown)
  root.addEventListener('pointermove', onStickMove)
  root.addEventListener('pointerup', onStickEnd)
  root.addEventListener('pointercancel', onStickEnd)
  root.addEventListener('lostpointercapture', onStickEnd)
  target.addEventListener('pointerdown', onCanvasDown)
  target.addEventListener('pointermove', onCanvasMove)
  target.addEventListener('pointerup', onCanvasEnd)
  target.addEventListener('pointercancel', onCanvasEnd)
  target.addEventListener('lostpointercapture', onCanvasEnd)

  return {
    contribute(frame: FrameInput): void {
      frame.moveX += moveX
      frame.moveY += moveY
      frame.lookX += lookX
      frame.lookY += lookY
      frame.zoom += zoom
      lookX = 0
      lookY = 0
      zoom = 0
    },
    setActive(next: boolean): void {
      active = next
      if (!next) {
        points.clear()
        releaseStick()
        lookId = -1
        pinchId = -1
        lastPinch = 0
        lookX = 0
        lookY = 0
        zoom = 0
      }
      syncStick()
    },
    setWalking(next: boolean): void {
      if (walking === next) return
      walking = next
      if (!next) releaseStick()
      syncStick()
    },
    dispose(): void {
      root.removeEventListener('pointerdown', onStickDown)
      root.removeEventListener('pointermove', onStickMove)
      root.removeEventListener('pointerup', onStickEnd)
      root.removeEventListener('pointercancel', onStickEnd)
      root.removeEventListener('lostpointercapture', onStickEnd)
      target.removeEventListener('pointerdown', onCanvasDown)
      target.removeEventListener('pointermove', onCanvasMove)
      target.removeEventListener('pointerup', onCanvasEnd)
      target.removeEventListener('pointercancel', onCanvasEnd)
      target.removeEventListener('lostpointercapture', onCanvasEnd)
      root.remove()
    },
  }
}

function ensureStyle(): void {
  if (document.getElementById('joystick-style')) return
  const style = document.createElement('style')
  style.id = 'joystick-style'
  style.textContent = `
    .joystick {
      position: fixed;
      z-index: 3;
      left: calc(18px + env(safe-area-inset-left));
      bottom: calc(22px + env(safe-area-inset-bottom));
      width: ${STICK_PX}px;
      height: ${STICK_PX}px;
      border-radius: 50%;
      border: 1.5px solid rgba(242, 239, 233, 0.78);
      background: rgba(184, 190, 198, 0.28);
      box-shadow: inset 0 0 0 1px rgba(184, 190, 198, 0.18);
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
    }
    .joystick[hidden] {
      display: none !important;
    }
    .joystick-knob {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 48px;
      height: 48px;
      margin: -24px 0 0 -24px;
      border-radius: 50%;
      background: rgba(242, 239, 233, 0.82);
      border: 1px solid rgba(184, 190, 198, 0.9);
      pointer-events: none;
    }
    @media (max-height: 430px) {
      .joystick {
        width: 96px;
        height: 96px;
      }
      .joystick-knob {
        width: 42px;
        height: 42px;
        margin: -21px 0 0 -21px;
      }
    }
  `
  document.head.appendChild(style)
}
