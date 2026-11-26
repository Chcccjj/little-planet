import { Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { frameFromUp } from '../../src/math/frameFromUp'

function expectFrame(up: Vector3, hint: Vector3): void {
  const upIn = up.clone()
  const hintIn = hint.clone()
  const orientation = new Quaternion()
  frameFromUp(up, hint, orientation)

  expect(up.distanceTo(upIn)).toBeLessThan(1e-12)
  expect(hint.distanceTo(hintIn)).toBeLessThan(1e-12)
  expect(orientation.x).not.toBeNaN()
  expect(orientation.y).not.toBeNaN()
  expect(orientation.z).not.toBeNaN()
  expect(orientation.w).not.toBeNaN()

  const x = new Vector3(1, 0, 0).applyQuaternion(orientation)
  const y = new Vector3(0, 1, 0).applyQuaternion(orientation)
  const z = new Vector3(0, 0, 1).applyQuaternion(orientation)
  expect(y.distanceTo(up.clone().normalize())).toBeLessThan(1e-5)
  expect(Math.abs(x.dot(y))).toBeLessThan(1e-5)
  expect(Math.abs(y.dot(z))).toBeLessThan(1e-5)
  expect(Math.abs(x.dot(z))).toBeLessThan(1e-5)
  expect(Math.abs(x.length() - 1)).toBeLessThan(1e-5)
  expect(new Vector3().crossVectors(x, y).distanceTo(z)).toBeLessThan(1e-5)
}

describe('frameFromUp', () => {
  it('builds a right-handed frame on the equator and at both poles', () => {
    expectFrame(new Vector3(0, 1, 0), new Vector3(0, 0, 1))
    expectFrame(new Vector3(0, -1, 0), new Vector3(0, 0, 1))
    expectFrame(new Vector3(1, 0, 0), new Vector3(0, 1, 0))
    expectFrame(new Vector3(0.2, 0.9, -0.4), new Vector3(-1, 0.1, 0.3))
  })

  it('flattens a forward hint that is not tangent, and survives a parallel hint', () => {
    const up = new Vector3(0, 1, 0)
    const orientation = new Quaternion()
    frameFromUp(up, new Vector3(0, 4, 2), orientation)
    const forward = new Vector3(0, 0, 1).applyQuaternion(orientation)
    expect(forward.distanceTo(new Vector3(0, 0, 1))).toBeLessThan(1e-5)

    expectFrame(new Vector3(0, 1, 0), new Vector3(0, 1, 0))
    expectFrame(new Vector3(0, -1, 0), new Vector3(0, -3, 0))
  })
})
