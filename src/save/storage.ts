/** Versioned so a later save shape can ignore this one instead of crashing. */
export const SAVE_KEY = 'little-planet.save.v1'

const KNOWN_IDS = new Set(['rose', 'volcano-0', 'volcano-1', 'volcano-2', 'baobab', 'chair'])

export interface PlanetSave {
  v: 1
  /** Unit direction from the planet center through the prince. */
  dx: number
  dy: number
  dz: number
  /** Facing hint, flattened onto the ground when applied. */
  fx: number
  fy: number
  fz: number
  discovered: string[]
  sunsetViews: number
  /** Placeholder. No audio is loaded; the switch only remembers this flag. */
  sound: boolean
}

export function loadSave(): PlanetSave | null {
  const raw = readRaw()
  if (raw === null) return null
  return parseSave(raw)
}

export function writeSave(save: PlanetSave): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save))
    return true
  } catch {
    return false
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY)
  } catch {
    // Private mode and disabled storage both just mean there is nothing to clear.
  }
}

/** Accept only a v1 object. Anything else, including broken JSON, is "no save". */
export function parseSave(raw: string): PlanetSave | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const rec = data as Record<string, unknown>
  if (rec.v !== 1) return null
  const dx = finite(rec.dx)
  const dy = finite(rec.dy)
  const dz = finite(rec.dz)
  const fx = finite(rec.fx)
  const fy = finite(rec.fy)
  const fz = finite(rec.fz)
  if (dx === null || dy === null || dz === null || fx === null || fy === null || fz === null) return null
  if (dx * dx + dy * dy + dz * dz < 1e-4) return null
  if (fx * fx + fy * fy + fz * fz < 1e-4) return null
  if (!Array.isArray(rec.discovered)) return null
  const discovered: string[] = []
  for (let i = 0; i < rec.discovered.length; i++) {
    const id = rec.discovered[i]
    if (typeof id !== 'string' || !KNOWN_IDS.has(id) || discovered.includes(id)) continue
    discovered.push(id)
  }
  const sunsetViews = count(rec.sunsetViews)
  if (sunsetViews === null) return null
  return {
    v: 1,
    dx,
    dy,
    dz,
    fx,
    fy,
    fz,
    discovered,
    sunsetViews,
    sound: typeof rec.sound === 'boolean' ? rec.sound : true,
  }
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(SAVE_KEY)
  } catch {
    return null
  }
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function count(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return Math.min(9999, Math.floor(value))
}
