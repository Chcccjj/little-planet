import { describe, expect, it } from 'vitest'
import { PixelRatioAdaptor, choosePixelRatio, stepDownPixelRatio } from '../../src/core/viewport'

const desktop = {
  devicePixelRatio: 3,
  coarsePointer: false,
  hardwareConcurrency: 8,
  viewportWidth: 1440,
  viewportHeight: 900,
}

describe('choosePixelRatio', () => {
  it('caps a desktop display at 2 and never above the device ratio', () => {
    expect(choosePixelRatio(desktop)).toBe(2)
    expect(choosePixelRatio({ ...desktop, devicePixelRatio: 1.25 })).toBe(1.25)
    expect(choosePixelRatio({ ...desktop, devicePixelRatio: 0 })).toBe(1)
  })

  it('adapts a coarse pointer down for large screens and small devices', () => {
    const phone = {
      devicePixelRatio: 3,
      coarsePointer: true,
      hardwareConcurrency: 6,
      viewportWidth: 390,
      viewportHeight: 844,
    }
    expect(choosePixelRatio(phone)).toBe(1.5)
    expect(choosePixelRatio({ ...phone, viewportWidth: 1024, viewportHeight: 1366 })).toBe(1.25)
    expect(choosePixelRatio({ ...phone, deviceMemory: 3 })).toBe(1.25)
    expect(choosePixelRatio({ ...phone, deviceMemory: 2 })).toBe(1)
    expect(choosePixelRatio({ ...phone, hardwareConcurrency: 2 })).toBe(1)
    expect(choosePixelRatio({ ...phone, devicePixelRatio: 1 })).toBe(1)
  })
})

describe('stepDownPixelRatio', () => {
  it('steps by a quarter only while the frame rate is under the floor', () => {
    expect(stepDownPixelRatio(1.5, 60)).toBe(1.5)
    expect(stepDownPixelRatio(1.5, 28)).toBe(1.5)
    expect(stepDownPixelRatio(1.5, 27.9)).toBe(1.25)
    expect(stepDownPixelRatio(1, 10)).toBe(1)
  })
})

describe('PixelRatioAdaptor', () => {
  it('ignores the warmup and then steps down after two slow windows', () => {
    const adaptor = new PixelRatioAdaptor(2)
    expect(adaptor.push(0)).toBe(2)
    let now = 0
    const step = (ms: number) => {
      now += ms
      return adaptor.push(now)
    }
    for (let i = 0; i < 7; i++) expect(step(250)).toBe(2)
    expect(step(250)).toBe(2)
    expect(step(250)).toBe(2)
    expect(step(250)).toBe(2)
    expect(step(250)).toBe(1.75)
  })

  it('does not step a device that is already at the floor', () => {
    const adaptor = new PixelRatioAdaptor(1)
    adaptor.push(0)
    let now = 0
    for (let i = 0; i < 20; i++) {
      now += 250
      expect(adaptor.push(now)).toBe(1)
    }
  })
})
