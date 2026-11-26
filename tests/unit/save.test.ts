import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSave, loadSave, parseSave, writeSave, type PlanetSave } from '../../src/save/storage'

const valid: PlanetSave = {
  v: 1,
  dx: 0.2,
  dy: 0.9,
  dz: 0.3,
  fx: 0,
  fy: 0,
  fz: 1,
  discovered: ['rose', 'chair'],
  sunsetViews: 2,
  sound: false,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseSave', () => {
  it('accepts a v1 save and drops unknown or repeated discoveries', () => {
    const parsed = parseSave(
      JSON.stringify({
        ...valid,
        discovered: ['rose', 'nope', 'rose', 'chair', 4],
        sunsetViews: 2.9,
      }),
    )
    expect(parsed).toEqual({ ...valid, sunsetViews: 2 })
  })

  it('rejects a broken payload', () => {
    expect(parseSave('{')).toBeNull()
    expect(parseSave('null')).toBeNull()
    expect(parseSave(JSON.stringify({ ...valid, v: 2 }))).toBeNull()
    expect(parseSave(JSON.stringify({ ...valid, dx: 0, dy: 0, dz: 0 }))).toBeNull()
    expect(parseSave(JSON.stringify({ ...valid, fx: Number.NaN }))).toBeNull()
    expect(parseSave(JSON.stringify({ ...valid, discovered: 'rose' }))).toBeNull()
    expect(parseSave(JSON.stringify({ ...valid, sunsetViews: -1 }))).toBeNull()
  })

  it('defaults a missing sound flag and caps the sunset count', () => {
    const raw = { ...valid } as Partial<PlanetSave>
    delete raw.sound
    expect(parseSave(JSON.stringify({ ...raw, sunsetViews: 50000 }))?.sound).toBe(true)
    expect(parseSave(JSON.stringify({ ...raw, sunsetViews: 50000 }))?.sunsetViews).toBe(9999)
  })
})

describe('loadSave and writeSave', () => {
  it('round-trips through localStorage', () => {
    vi.stubGlobal('localStorage', memory())
    expect(loadSave()).toBeNull()
    expect(writeSave(valid)).toBe(true)
    expect(loadSave()).toEqual(valid)
    clearSave()
    expect(loadSave()).toBeNull()
  })

  it('treats a thrown storage API as no save', () => {
    const fail = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('localStorage', { getItem: fail, setItem: fail, removeItem: fail })
    expect(loadSave()).toBeNull()
    expect(writeSave(valid)).toBe(false)
    expect(() => clearSave()).not.toThrow()
  })
})

function memory(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key)
    },
    setItem: (key, value) => {
      map.set(key, value)
    },
  }
}
