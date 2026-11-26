import {
  BackSide,
  CanvasTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
} from 'three'
import { palette } from '../config/palette'

const SKY_SIZE = 1024

export interface SkyView {
  readonly mesh: Mesh
  /** 0 is the daytime wash, 1 is the full sunset painting. */
  setBlend(amount: number): void
}

interface SkyWash {
  stops: readonly { at: number; color: string }[]
  stars: number
  starFrom: number
  starSpan: number
  starAlpha: number
  starAlphaSpan: number
  seed: number
}

/**
 * Day and sunset are two paintings on one sphere. The sunset mesh is a
 * slightly smaller transparent shell drawn before the other transparents,
 * so glass and smoke stay on top of the wash as it fades in.
 */
export function createSky(): SkyView {
  const geometry = new SphereGeometry(380, 48, 32)
  const dayMaterial = new MeshBasicMaterial({
    map: paintSky(DAY),
    side: BackSide,
    fog: false,
    depthWrite: false,
  })

  const day = new Mesh(geometry, dayMaterial)
  day.name = 'sky'
  day.frustumCulled = false
  day.renderOrder = -2

  // The dusk painting is a second 1024 canvas. It stays unbuilt until the
  // chair actually asks for a sunset.
  let duskMaterial: MeshBasicMaterial | null = null
  let dusk: Mesh | null = null

  const ensureDusk = () => {
    if (dusk && duskMaterial) return
    duskMaterial = new MeshBasicMaterial({
      map: paintSky(DUSK),
      side: BackSide,
      fog: false,
      depthWrite: false,
      transparent: true,
      opacity: 0,
    })
    dusk = new Mesh(geometry, duskMaterial)
    dusk.name = 'sky-sunset'
    // Inside the daytime shell so the depth test still passes over it,
    // and early in the transparent queue so the dome composites afterwards.
    dusk.scale.setScalar(0.97)
    dusk.frustumCulled = false
    dusk.renderOrder = -1
    day.add(dusk)
  }

  return {
    mesh: day,
    setBlend(amount: number): void {
      const blend = amount < 0 ? 0 : amount > 1 ? 1 : amount
      if (blend <= 0.001) {
        if (dusk && duskMaterial) {
          dusk.visible = false
          duskMaterial.opacity = 0
        }
        return
      }
      ensureDusk()
      if (!dusk || !duskMaterial) return
      dusk.visible = true
      duskMaterial.opacity = blend
    },
  }
}

const DAY: SkyWash = {
  stops: [
    { at: 0, color: palette.hazeBlue },
    { at: 0.47, color: palette.hazeBlue },
    { at: 0.58, color: palette.mistGray },
    { at: 0.7, color: palette.offWhite },
    { at: 1, color: palette.offWhite },
  ],
  stars: 140,
  starFrom: 0.44,
  starSpan: 0.12,
  starAlpha: 0.78,
  starAlphaSpan: 0.22,
  seed: 1337,
}

const DUSK: SkyWash = {
  stops: [
    { at: 0, color: palette.duskViolet },
    { at: 0.42, color: palette.duskViolet },
    { at: 0.55, color: palette.duskLilac },
    { at: 0.66, color: palette.warmAsh },
    { at: 0.8, color: palette.duskMilk },
    { at: 1, color: palette.duskMilk },
  ],
  stars: 64,
  starFrom: 0.34,
  starSpan: 0.16,
  starAlpha: 0.28,
  starAlphaSpan: 0.22,
  seed: 4099,
}

function paintSky(wash: SkyWash): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = SKY_SIZE
  canvas.height = SKY_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Sky canvas is unavailable')

  // Stops are placed on the rows the idle orbit actually sees
  // (about 0.47 at the top of the frame to 0.71 at the bottom).
  const gradient = ctx.createLinearGradient(0, 0, 0, SKY_SIZE)
  for (let i = 0; i < wash.stops.length; i++) {
    gradient.addColorStop(wash.stops[i].at, wash.stops[i].color)
  }
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, SKY_SIZE, SKY_SIZE)

  let seed = wash.seed
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }

  // Stipple only the haze band. The pale horizon stays empty.
  for (let i = 0; i < wash.stars; i++) {
    const x = rand() * SKY_SIZE
    const y = SKY_SIZE * (wash.starFrom + rand() * wash.starSpan)
    const radius = 2 + rand() * 1.4
    const alpha = wash.starAlpha + rand() * wash.starAlphaSpan
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius)
    glow.addColorStop(0, hexToRgba(palette.offWhite, alpha))
    glow.addColorStop(0.45, hexToRgba(palette.offWhite, alpha * 0.5))
    glow.addColorStop(1, hexToRgba(palette.offWhite, 0))
    ctx.fillStyle = glow
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  // The sky is large; mipmaps would swallow stars that are only a few texels wide.
  texture.generateMipmaps = false
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.wrapS = RepeatWrapping
  return texture
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
