import { describe, expect, it } from 'vitest'
import { clientToNdc, ndcToClient } from '../../src/math/screen'
import { framedDistance } from '../../src/camera/followCamera'

describe('screen mapping', () => {
  const rect = { left: 10, top: 20, width: 200, height: 100 }

  it('round-trips pointer coordinates through normalized device coordinates', () => {
    for (const point of [
      { x: 10, y: 20 },
      { x: 210, y: 120 },
      { x: 110, y: 70 },
      { x: 40, y: 90 },
    ]) {
      const ndc = clientToNdc(point.x, point.y, rect)
      const back = ndcToClient(ndc.x, ndc.y, rect)
      expect(back.x).toBeCloseTo(point.x)
      expect(back.y).toBeCloseTo(point.y)
    }
  })

  it('puts the canvas center at the origin and the top edge at +1', () => {
    expect(clientToNdc(110, 70, rect)).toEqual({ x: 0, y: 0 })
    expect(clientToNdc(110, 20, rect).y).toBeCloseTo(1)
    expect(clientToNdc(210, 70, rect).x).toBeCloseTo(1)
  })
})

describe('framedDistance', () => {
  it('pulls the camera back only for a portrait viewport', () => {
    expect(framedDistance(4.9, 1.6)).toBe(4.9)
    expect(framedDistance(4.9, 1)).toBe(4.9)
    expect(framedDistance(4.9, 0.5)).toBeCloseTo(9.8)
    expect(framedDistance(4.9, 0)).toBe(4.9)
    expect(framedDistance(4.9, Number.NaN)).toBe(4.9)
  })
})
