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

/**
 * Inside-out sphere with a painted gradient and a few soft stars.
 * Fog is off so the wash stays readable behind the mist around the planet.
 */
export function createSky(): Mesh {
  const texture = paintSky()
  const material = new MeshBasicMaterial({
    map: texture,
    side: BackSide,
    fog: false,
    depthWrite: false,
  })

  const sky = new Mesh(new SphereGeometry(380, 48, 32), material)
  sky.name = 'sky'
  sky.frustumCulled = false
  return sky
}

function paintSky(): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = SKY_SIZE
  canvas.height = SKY_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Sky canvas is unavailable')

  // Stops are placed on the rows the idle orbit actually sees
  // (about 0.47 at the top of the frame to 0.71 at the bottom).
  const gradient = ctx.createLinearGradient(0, 0, 0, SKY_SIZE)
  gradient.addColorStop(0, palette.hazeBlue)
  gradient.addColorStop(0.47, palette.hazeBlue)
  gradient.addColorStop(0.58, palette.mistGray)
  gradient.addColorStop(0.7, palette.offWhite)
  gradient.addColorStop(1, palette.offWhite)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, SKY_SIZE, SKY_SIZE)

  let seed = 1337
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }

  // Stipple only the haze band. The pale horizon stays empty.
  for (let i = 0; i < 140; i++) {
    const x = rand() * SKY_SIZE
    const y = SKY_SIZE * (0.44 + rand() * 0.12)
    const radius = 2 + rand() * 1.4
    const alpha = 0.78 + rand() * 0.22
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
