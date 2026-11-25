import { Color, Quaternion, Vector3, type DirectionalLight, type FogExp2, type HemisphereLight } from 'three'
import { palette } from '../config/palette'
import { frameFromUp } from '../math/frameFromUp'
import type { SkyView } from '../scene/sky'
import type { SphereCollider } from '../world/collision'
import { SURFACE_CLEARANCE, type SurfaceProbe } from '../world/surfaceProbe'
import type { SurfaceAnchor } from '../world/props'

const RISE_SECONDS = 2.6
const HOLD_SECONDS = 4.2
const FALL_SECONDS = 2.8
const NUDGE = 0.4
const YAW = 0.62

const DUSK_SUN_INTENSITY = 0.8
const DUSK_FILL_INTENSITY = 0.68
const DUSK_DENSITY = 0.021

const _hint = new Vector3(1, 0, 0.2)

export interface SunsetShow {
  readonly playing: boolean
  readonly blend: number
  /** Starts the wash and nudges the chair. False when one is already playing. */
  start(): boolean
  update(dt: number): void
  /** Draw-call sweep. Does not change the timeline. */
  preview(amount: number): void
  restore(): void
  /** Daylight again, chair back where it was planted. */
  reset(): void
}

/**
 * Morandi dusk: warm gray-pink at the horizon, blue-violet overhead.
 * The chair slides a short step along the surface and turns a little,
 * then stays where it landed so the next viewing can move it again.
 */
export function createSunset(options: {
  sun: DirectionalLight
  fill: HemisphereLight
  fog: FogExp2
  sky: SkyView
  surface: SurfaceProbe
  chair: SurfaceAnchor
  colliders: readonly SphereCollider[]
  avoid(): Vector3
  avoidRadius: number
}): SunsetShow {
  const sun = options.sun
  const fill = options.fill
  const fog = options.fog
  const chair = options.chair

  const daySunColor = sun.color.clone()
  const dayFillColor = fill.color.clone()
  const dayGround = fill.groundColor.clone()
  const dayFog = fog.color.clone()
  const dayPos = sun.position.clone()
  const daySunIntensity = sun.intensity
  const dayFillIntensity = fill.intensity
  const dayDensity = fog.density
  const homePos = chair.mesh.position.clone()
  const homeQuat = chair.mesh.quaternion.clone()
  const homeUp = chair.up.clone()

  const duskSunColor = new Color(palette.warmAsh)
  const duskFillColor = new Color(palette.warmAsh)
  const duskGround = new Color(palette.duskViolet)
  const duskFog = new Color(palette.duskFog)
  const duskPos = new Vector3(28, 5, 12)

  let mode: 'idle' | 'rise' | 'hold' | 'fall' = 'idle'
  let elapsed = 0
  let live = 0
  let heading = 0.4
  let moving = false

  const fromPos = new Vector3()
  const toPos = new Vector3()
  const fromQuat = new Quaternion()
  const toQuat = new Quaternion()
  const pos = new Vector3()
  const dir = new Vector3()
  const up = new Vector3()
  const axis = new Vector3()
  const tangent = new Vector3()
  const baseTangent = new Vector3()
  const delta = new Quaternion()
  const yaw = new Quaternion()

  const apply = (t: number) => {
    sun.color.copy(daySunColor).lerp(duskSunColor, t)
    fill.color.copy(dayFillColor).lerp(duskFillColor, t)
    fill.groundColor.copy(dayGround).lerp(duskGround, t)
    fog.color.copy(dayFog).lerp(duskFog, t)
    sun.position.copy(dayPos).lerp(duskPos, t)
    sun.intensity = daySunIntensity + (DUSK_SUN_INTENSITY - daySunIntensity) * t
    fill.intensity = dayFillIntensity + (DUSK_FILL_INTENSITY - dayFillIntensity) * t
    fog.density = dayDensity + (DUSK_DENSITY - dayDensity) * t
    options.sky.setBlend(t)
  }

  const commit = (t: number) => {
    live = t
    apply(t)
  }

  const slide = (origin: Vector3, across: Vector3, distance: number, out: Vector3) => {
    up.copy(origin).normalize()
    axis.crossVectors(up, across)
    const len = axis.length()
    if (len < 1e-8) {
      out.copy(origin)
      return
    }
    axis.multiplyScalar(1 / len)
    const radius = Math.max(origin.length(), 0.5)
    delta.setFromAxisAngle(axis, distance / radius)
    dir.copy(origin).applyQuaternion(delta).normalize()
    out.copy(dir).multiplyScalar(options.surface.radiusAlong(dir) + SURFACE_CLEARANCE)
  }

  const blocked = (next: Vector3) => {
    const chairRadius = chair.collider.radius
    const colliders = options.colliders
    for (let i = 0; i < colliders.length; i++) {
      const other = colliders[i]
      if (other === chair.collider) continue
      const min = other.radius + chairRadius + 0.05
      if (next.distanceToSquared(other.center) < min * min) return true
    }
    const personal = chairRadius + options.avoidRadius + 0.2
    return next.distanceToSquared(options.avoid()) < personal * personal
  }

  const planChair = () => {
    fromPos.copy(chair.mesh.position)
    fromQuat.copy(chair.mesh.quaternion)
    up.copy(fromPos).normalize()
    baseTangent.set(0, 1, 0).cross(up)
    if (baseTangent.lengthSq() < 1e-6) baseTangent.set(1, 0, 0).cross(up)
    baseTangent.normalize()

    let found = false
    for (let i = 0; i < 8; i++) {
      const spin = heading + (i * Math.PI) / 4
      tangent.copy(baseTangent).applyAxisAngle(up, spin)
      slide(fromPos, tangent, NUDGE, toPos)
      if (!blocked(toPos)) {
        heading = spin + 0.9
        found = true
        break
      }
    }
    if (!found) slide(fromPos, baseTangent, NUDGE, toPos)

    frameFromUp(toPos, _hint, toQuat)
    up.copy(toPos).normalize()
    yaw.setFromAxisAngle(up, YAW)
    toQuat.premultiply(yaw)
    moving = true
  }

  const placeChair = (t: number) => {
    pos.lerpVectors(fromPos, toPos, t)
    dir.copy(pos).normalize()
    chair.mesh.position.copy(dir).multiplyScalar(options.surface.radiusAlong(dir) + SURFACE_CLEARANCE)
    chair.mesh.quaternion.slerpQuaternions(fromQuat, toQuat, t)
    chair.up.copy(dir)
  }

  return {
    get playing() {
      return mode !== 'idle'
    },
    get blend() {
      return live
    },
    start(): boolean {
      if (mode !== 'idle') return false
      planChair()
      mode = 'rise'
      elapsed = 0
      return true
    },
    update(dt: number): void {
      if (mode === 'idle') return
      elapsed += dt
      if (mode === 'rise') {
        const t = Math.min(1, elapsed / RISE_SECONDS)
        const eased = smoothstep(t)
        commit(eased)
        if (moving) placeChair(eased)
        if (t < 1) return
        if (moving) placeChair(1)
        moving = false
        mode = 'hold'
        elapsed = 0
        return
      }
      if (mode === 'hold') {
        if (elapsed < HOLD_SECONDS) return
        mode = 'fall'
        elapsed = 0
        return
      }
      const t = Math.min(1, elapsed / FALL_SECONDS)
      commit(1 - smoothstep(t))
      if (t < 1) return
      mode = 'idle'
      elapsed = 0
      commit(0)
    },
    preview(amount: number): void {
      apply(amount < 0 ? 0 : amount > 1 ? 1 : amount)
    },
    restore(): void {
      apply(live)
    },
    reset(): void {
      mode = 'idle'
      elapsed = 0
      moving = false
      commit(0)
      chair.mesh.position.copy(homePos)
      chair.mesh.quaternion.copy(homeQuat)
      chair.up.copy(homeUp)
    },
  }
}

function smoothstep(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t
  return x * x * (3 - 2 * x)
}
