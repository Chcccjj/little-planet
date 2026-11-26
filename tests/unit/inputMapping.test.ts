import { describe, expect, it, vi } from 'vitest'
import { combineDrivers } from '../../src/input/createInput'
import {
  clampToUnitDisc,
  keyboardMove,
  normalizeWheelDelta,
} from '../../src/input/mapping'
import { stickAxes } from '../../src/input/stick'
import { createFrameInput, type InputDriver } from '../../src/input/types'

describe('keyboardMove', () => {
  it('maps WASD and arrows, and cancels opposite keys', () => {
    expect(keyboardMove(new Set(['KeyW']))).toEqual({ x: 0, y: 1 })
    expect(keyboardMove(new Set(['ArrowUp']))).toEqual({ x: 0, y: 1 })
    expect(keyboardMove(new Set(['KeyS']))).toEqual({ x: 0, y: -1 })
    expect(keyboardMove(new Set(['KeyD', 'ArrowRight']))).toEqual({ x: 1, y: 0 })
    expect(keyboardMove(new Set(['KeyA']))).toEqual({ x: -1, y: 0 })
    expect(keyboardMove(new Set(['KeyW', 'KeyS']))).toEqual({ x: 0, y: 0 })
    expect(keyboardMove(new Set(['KeyA', 'KeyD']))).toEqual({ x: 0, y: 0 })
    expect(keyboardMove(new Set(['KeyW', 'KeyD']))).toEqual({ x: 1, y: 1 })
  })
})

describe('normalizeWheelDelta', () => {
  it('turns line and page modes into pixels', () => {
    expect(normalizeWheelDelta(2, 0)).toBe(2)
    expect(normalizeWheelDelta(2, 1)).toBe(32)
    expect(normalizeWheelDelta(-1, 2)).toBe(-400)
  })
})

describe('clampToUnitDisc', () => {
  it('leaves a short vector alone and normalizes a long one', () => {
    expect(clampToUnitDisc(0.6, 0.8)).toEqual({ x: 0.6, y: 0.8 })
    expect(clampToUnitDisc(0, 0)).toEqual({ x: 0, y: 0 })
    const clamped = clampToUnitDisc(3, 4)
    expect(clamped.x).toBeCloseTo(0.6)
    expect(clamped.y).toBeCloseTo(0.8)
  })
})

describe('stickAxes', () => {
  it('deadzones the middle, points up for a finger above center, and clamps the rim', () => {
    const inside = stickAxes(0, -3, 100)
    expect(inside.x).toBe(0)
    expect(inside.y).toBe(0)
    expect(inside.knobY).toBe(-3)

    const up = stickAxes(0, -32, 100)
    expect(up.x).toBeCloseTo(0)
    expect(up.y).toBeCloseTo(1)

    const shoved = stickAxes(100, 0, 100)
    expect(shoved.x).toBeCloseTo(1)
    expect(shoved.y).toBeCloseTo(0)
    expect(shoved.knobX).toBeCloseTo(32)
  })
})

describe('combineDrivers', () => {
  it('sums look and zoom, and clamps the combined move', () => {
    const frame = createFrameInput()
    const active = vi.fn()
    const input = combineDrivers([
      fake({ moveX: 1, moveY: 0, lookX: 3, lookY: 0, zoom: 4 }, active),
      fake({ moveX: 1, moveY: 0, lookX: 4, lookY: -2, zoom: 1 }, active),
    ])
    input.read(frame)
    expect(frame.moveX).toBeCloseTo(1)
    expect(frame.moveY).toBeCloseTo(0)
    expect(frame.lookX).toBe(7)
    expect(frame.lookY).toBe(-2)
    expect(frame.zoom).toBe(5)
    input.setActive(false)
    expect(active).toHaveBeenCalledTimes(2)
    expect(active).toHaveBeenCalledWith(false)
  })
})

function fake(
  sample: { moveX: number; moveY: number; lookX: number; lookY: number; zoom: number },
  onActive: (active: boolean) => void,
): InputDriver {
  return {
    contribute(frame) {
      frame.moveX += sample.moveX
      frame.moveY += sample.moveY
      frame.lookX += sample.lookX
      frame.lookY += sample.lookY
      frame.zoom += sample.zoom
    },
    setActive: onActive,
    setWalking() {},
    dispose() {},
  }
}
