import {
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three'
import { palette } from '../config/palette'
import { createSky, type SkyView } from './sky'

export interface SceneContext {
  scene: Scene
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  sun: DirectionalLight
  fill: HemisphereLight
  fog: FogExp2
  sky: SkyView
}

const DESKTOP_PIXEL_RATIO = 2
const COARSE_PIXEL_RATIO = 1.5

/**
 * Antialias plus a 1024 shadow map is heavy on mid-range phones, so coarse
 * pointers (touch) cap DPR at 1.5. Desktop mice stay at 2. Read again on resize.
 */
export function rendererPixelRatio(): number {
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const cap = coarse ? COARSE_PIXEL_RATIO : DESKTOP_PIXEL_RATIO
  return Math.min(window.devicePixelRatio || 1, cap)
}

/**
 * Picture-book stage: misty fog, a soft sky fill, and one warm key light
 * with a small shadow map. The planet itself is added by the caller.
 */
export function createScene(container: HTMLElement): SceneContext {
  const scene = new Scene()
  // The sky sphere covers every pixel the camera can see, so a clear color
  // would only flash for the frames before it draws.
  const fog = new FogExp2(palette.mistGray, 0.015)
  scene.fog = fog

  const camera = new PerspectiveCamera(40, 1, 0.1, 700)

  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.setPixelRatio(rendererPixelRatio())
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

  const sky = createSky()
  scene.add(sky.mesh)

  return { scene, camera, renderer, sun, fill, fog, sky }
}

/** Full-viewport canvas. Pixel ratio is capped so high-DPI phones stay light. */
export function resizeScene(ctx: SceneContext): void {
  const width = window.innerWidth
  const height = Math.max(window.innerHeight, 1)
  ctx.camera.aspect = width / height
  ctx.camera.updateProjectionMatrix()
  ctx.renderer.setPixelRatio(rendererPixelRatio())
  ctx.renderer.setSize(width, height)
}
