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
import { currentPixelRatio } from '../core/viewport'
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

/**
 * Picture-book stage: misty fog, a soft sky fill, and one warm key light
 * with a small shadow map. The planet itself is added by the caller.
 * Touch devices skip MSAA and use a 512 shadow map. The shadow pass is
 * manual: nothing moves on the title screen, so idle frames skip it.
 */
export function createScene(container: HTMLElement): SceneContext {
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const scene = new Scene()
  // The sky sphere covers every pixel the camera can see, so a clear color
  // would only flash for the frames before it draws.
  const fog = new FogExp2(palette.mistGray, 0.015)
  scene.fog = fog

  const camera = new PerspectiveCamera(40, 1, 0.1, 700)

  const renderer = new WebGLRenderer({
    antialias: !coarse,
    alpha: false,
    powerPreference: coarse ? 'default' : 'high-performance',
    // Automation reads pixels after the frame is presented. Players do not.
    preserveDrawingBuffer: navigator.webdriver === true,
  })
  renderer.outputColorSpace = SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.autoUpdate = false
  renderer.shadowMap.needsUpdate = true
  renderer.setPixelRatio(currentPixelRatio())
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
  const shadowSize = coarse ? 512 : 1024
  sun.shadow.mapSize.set(shadowSize, shadowSize)
  sun.shadow.camera.near = 10
  sun.shadow.camera.far = 70
  sun.shadow.camera.left = -14
  sun.shadow.camera.right = 14
  sun.shadow.camera.top = 14
  sun.shadow.camera.bottom = -14
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.04
  // PCF radius softens the shadow without the removed PCFSoftShadowMap path.
  sun.shadow.radius = coarse ? 2 : 3.5
  scene.add(sun)

  const sky = createSky()
  scene.add(sky.mesh)

  return { scene, camera, renderer, sun, fill, fog, sky }
}

/** Size the canvas to the visual viewport. Skips the buffer realloc when nothing changed. */
export function resizeScene(ctx: SceneContext, width: number, height: number, pixelRatio: number): void {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  const ratio = Math.min(2, pixelRatio > 0 ? pixelRatio : 1)
  const canvas = ctx.renderer.domElement
  const bufferW = Math.floor(w * ratio)
  const bufferH = Math.floor(h * ratio)
  if (canvas.width === bufferW && canvas.height === bufferH && ctx.camera.aspect === w / h) return
  ctx.camera.aspect = w / h
  ctx.camera.updateProjectionMatrix()
  if (ctx.renderer.getPixelRatio() !== ratio) ctx.renderer.setPixelRatio(ratio)
  ctx.renderer.setSize(w, h, false)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  canvas.style.touchAction = 'none'
}
