import {
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'
import { palette } from '../config/palette'
import { createSky } from './sky'

export interface SceneContext {
  scene: Scene
  camera: PerspectiveCamera
  renderer: WebGLRenderer
}

const MAX_PIXEL_RATIO = 2

/**
 * Picture-book stage: misty fog, a soft sky fill, and one warm key light
 * with a small shadow map. The planet itself is added by the caller.
 */
export function createScene(container: HTMLElement): SceneContext {
  const scene = new Scene()
  scene.background = new Color(palette.hazeBlue)
  scene.fog = new FogExp2(palette.mistGray, 0.015)

  const camera = new PerspectiveCamera(40, 1, 0.1, 700)

  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO))
  container.appendChild(renderer.domElement)

  // Sky-to-ground fill keeps the night side of the asteroid in mist, not black.
  const fill = new HemisphereLight(palette.offWhite, palette.hazeBlue, 0.92)
  fill.position.set(0, 1, 0)
  fill.name = 'fill'
  scene.add(fill)

  // Dusty rose is the warmest Morandi swatch — a sun, not a saturated yellow.
  const sun = new DirectionalLight(palette.dustyRose, 1.15)
  sun.name = 'sun'
  sun.position.set(16, 22, 8)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.near = 10
  sun.shadow.camera.far = 70
  sun.shadow.camera.left = -14
  sun.shadow.camera.right = 14
  sun.shadow.camera.top = 14
  sun.shadow.camera.bottom = -14
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.04
  // PCF radius softens the shadow without the removed PCFSoftShadowMap path.
  sun.shadow.radius = 3.5
  scene.add(sun)

  scene.add(createSky())

  return { scene, camera, renderer }
}

/** Full-viewport canvas. Pixel ratio is capped so high-DPI phones stay light. */
export function resizeScene(ctx: SceneContext): void {
  const width = window.innerWidth
  const height = Math.max(window.innerHeight, 1)
  ctx.camera.aspect = width / height
  ctx.camera.updateProjectionMatrix()
  ctx.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO))
  ctx.renderer.setSize(width, height)
}
