import { Vector3 } from 'three'
import type { FollowCamera } from '../camera/followCamera'
import type { Locomotion } from '../character/locomotion'
import type { InteractionState, Interactions } from '../interactions'
import type { SceneContext } from '../scene/createScene'

export interface PlanetReadout {
  x: number
  y: number
  z: number
  ux: number
  uy: number
  uz: number
  radius: number
  calls: number
  triangles: number
  pixelRatio: number
}

export interface SessionSnapshot {
  mode: 'title' | 'play' | 'paused'
  discovered: string[]
  sunsetViews: number
  discoverable: number
  sound: boolean
}

export interface CameraReadout {
  x: number
  y: number
  z: number
  dx: number
  dy: number
  dz: number
  /** Camera position on the tangent plane, relative to the prince's facing. */
  orbitYaw: number
}

export interface LittlePlanetProbe {
  read(): PlanetReadout
  focus(id: string, yawPx?: number, pitchPx?: number): { x: number; y: number; near: string | null } | null
  project(id: string): { x: number; y: number } | null
  pick(clientX: number, clientY: number): string | null
  state(): InteractionState
  session(): SessionSnapshot
  camera(): CameraReadout
  maxDrawCalls(): { calls: number; triangles: number }
}

declare global {
  interface Window {
    __littlePlanet?: LittlePlanetProbe
  }
}

/**
 * Dev-only hooks for framing a prop and reading the renderer.
 * Production builds drop the call site, and this module with it.
 */
export function installProbe(sources: {
  locomotion: Locomotion
  follow: FollowCamera
  view: SceneContext
  interactions: Interactions
  session(): SessionSnapshot
}): void {
  const { locomotion, follow, view, interactions } = sources
  const debug = interactions.debug
  if (!debug) return
  const direction = new Vector3()
  const forward = new Vector3()
  const look = new Vector3()
  const offset = new Vector3()
  const right = new Vector3()

  window.__littlePlanet = {
    read() {
      const { position, up } = locomotion
      const info = view.renderer.info.render
      return {
        x: position.x,
        y: position.y,
        z: position.z,
        ux: up.x,
        uy: up.y,
        uz: up.z,
        radius: position.length(),
        calls: info.calls,
        triangles: info.triangles,
        pixelRatio: view.renderer.getPixelRatio(),
      }
    },
    focus(id: string, yawPx?: number, pitchPx?: number) {
      const stand = debug.stand(id)
      if (!stand) return null
      direction.set(stand.dx, stand.dy, stand.dz)
      forward.set(stand.fx, stand.fy, stand.fz)
      locomotion.relocate(direction, forward)
      follow.align(locomotion.up, locomotion.forward)
      const portrait = window.innerWidth < window.innerHeight
      const yaw = yawPx ?? (portrait ? 0 : 72)
      const pitch = pitchPx ?? (portrait ? 8 : 28)
      // dt of 1 snaps the follow smoothing so a screenshot is not mid-glide.
      follow.update(1, yaw, pitch, 0, locomotion.position, locomotion.up)
      interactions.update(0)
      const point = debug.project(id)
      if (!point) return null
      return { x: point.x, y: point.y, near: debug.state().near }
    },
    project(id: string) {
      return debug.project(id)
    },
    pick(clientX: number, clientY: number) {
      return debug.pick(clientX, clientY)
    },
    state() {
      return debug.state()
    },
    session() {
      return sources.session()
    },
    camera() {
      const position = view.camera.position
      view.camera.getWorldDirection(look)
      offset.copy(position).sub(locomotion.position)
      offset.addScaledVector(locomotion.up, -offset.dot(locomotion.up))
      right.crossVectors(locomotion.up, locomotion.forward)
      return {
        x: position.x,
        y: position.y,
        z: position.z,
        dx: look.x,
        dy: look.y,
        dz: look.z,
        orbitYaw: Math.atan2(offset.dot(right), offset.dot(locomotion.forward)),
      }
    },
    maxDrawCalls() {
      const camera = view.camera
      const renderer = view.renderer
      const savedPos = camera.position.clone()
      const savedQuat = camera.quaternion.clone()
      const savedUp = camera.up.clone()
      let calls = 0
      let triangles = 0
      const dir = new Vector3()
      const sample = (blend: number) => {
        debug.previewSunset(blend)
        for (let i = 0; i < 8; i++) {
          const theta = (i / 8) * Math.PI * 2
          for (const phi of [0.45, 1.15, 2.1]) {
            for (const radius of [8, 18]) {
              dir.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta))
              camera.position.copy(dir).multiplyScalar(radius)
              camera.up.set(0, 1, 0)
              if (Math.abs(camera.up.dot(dir)) > 0.98) camera.up.set(1, 0, 0)
              camera.lookAt(0, 0, 0)
              camera.updateMatrixWorld()
              renderer.render(view.scene, camera)
              const info = renderer.info.render
              if (info.calls > calls) calls = info.calls
              if (info.triangles > triangles) triangles = info.triangles
            }
          }
        }
      }
      try {
        sample(0)
        sample(1)
      } finally {
        debug.restoreSunset()
        camera.position.copy(savedPos)
        camera.quaternion.copy(savedQuat)
        camera.up.copy(savedUp)
        camera.updateMatrixWorld()
      }
      return { calls, triangles }
    },
  }
}
