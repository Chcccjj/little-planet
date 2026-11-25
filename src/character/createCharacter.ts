import { Color, Group, SphereGeometry, BoxGeometry } from 'three'
import { palette } from '../config/palette'
import { createSolidMesh, type SolidPart } from '../render/solidMesh'

/** Horizontal push radius. The scarf trails outside this and may visually overlap a prop. */
export const CHARACTER_RADIUS = 0.24

/** Camera looks at this height above the feet, around the chest. */
export const CHARACTER_LOOK_HEIGHT = 0.5

const body = new Color(palette.offWhite)
const scarf = new Color(palette.hazeBlue)
const hair = new Color(palette.mistGray).lerp(new Color(palette.offWhite), 0.28)
const boots = new Color(palette.mutedSage)
const ink = new Color(palette.hazeBlue).multiplyScalar(0.34)

export interface CharacterVisual {
  readonly root: Group
  updateVisual(dt: number, moving: boolean): void
}

/**
 * Placeholder Little Prince: code primitives, off-white body, haze-blue scarf.
 * One merged mesh so the figure is a single draw call. Local +Y is up, +Z is forward,
 * and the origin is the sole of the feet.
 */
export function createCharacter(): CharacterVisual {
  const parts: SolidPart[] = [
    { geometry: new BoxGeometry(0.085, 0.07, 0.12), color: boots, x: -0.055, y: 0.035, z: 0.02 },
    { geometry: new BoxGeometry(0.085, 0.07, 0.12), color: boots, x: 0.055, y: 0.035, z: 0.02 },
    { geometry: new BoxGeometry(0.07, 0.2, 0.075), color: body, x: -0.055, y: 0.16, z: 0 },
    { geometry: new BoxGeometry(0.07, 0.2, 0.075), color: body, x: 0.055, y: 0.16, z: 0 },
    { geometry: new BoxGeometry(0.24, 0.28, 0.16), color: body, x: 0, y: 0.42, z: 0 },
    {
      geometry: new BoxGeometry(0.055, 0.2, 0.06),
      color: body,
      x: -0.155,
      y: 0.42,
      z: 0.02,
      rz: 0.18,
    },
    {
      geometry: new BoxGeometry(0.055, 0.2, 0.06),
      color: body,
      x: 0.155,
      y: 0.42,
      z: 0.02,
      rz: -0.18,
    },
    { geometry: new BoxGeometry(0.28, 0.06, 0.18), color: scarf, x: 0, y: 0.545, z: 0.01 },
    {
      geometry: new BoxGeometry(0.055, 0.04, 0.22),
      color: scarf,
      x: 0.12,
      y: 0.48,
      z: -0.14,
      rx: 0.35,
      ry: 0.5,
      rz: 0.2,
    },
    {
      geometry: new BoxGeometry(0.045, 0.032, 0.16),
      color: scarf,
      x: 0.18,
      y: 0.42,
      z: -0.28,
      rx: 0.55,
      ry: 0.7,
    },
    { geometry: new SphereGeometry(0.125, 6, 5), color: body, x: 0, y: 0.67, z: 0.01 },
    {
      geometry: new SphereGeometry(0.11, 5, 4),
      color: hair,
      x: 0,
      y: 0.75,
      z: -0.015,
      sy: 0.62,
      sx: 1.12,
      sz: 1.05,
    },
    { geometry: new SphereGeometry(0.05, 4, 3), color: hair, x: 0.02, y: 0.74, z: 0.09 },
    { geometry: new BoxGeometry(0.034, 0.042, 0.03), color: ink, x: -0.046, y: 0.685, z: 0.132 },
    { geometry: new BoxGeometry(0.034, 0.042, 0.03), color: ink, x: 0.046, y: 0.685, z: 0.132 },
  ]

  const visual = createSolidMesh(parts, 'little-prince-mesh')
  const root = new Group()
  root.name = 'little-prince'
  root.add(visual)

  let phase = 0
  let moveBlend = 0

  return {
    root,
    updateVisual(dt: number, moving: boolean): void {
      const target = moving ? 1 : 0
      const ease = 1 - Math.exp(-8 * dt)
      moveBlend += (target - moveBlend) * ease
      phase += dt * 10 * moveBlend
      visual.position.y = Math.sin(phase) * 0.016 * moveBlend
      visual.rotation.x = -0.07 * moveBlend
    },
  }
}
