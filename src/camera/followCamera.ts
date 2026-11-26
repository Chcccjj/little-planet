import { PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { CHARACTER_LOOK_HEIGHT } from '../character/createCharacter'
import type { SphereCollider } from '../world/collision'
import type { SurfaceProbe } from '../world/surfaceProbe'

const PITCH_MIN = 0.2
const PITCH_MAX = 1.12
const DIST_MIN = 3.3
const DIST_MAX = 8.2
const DIST_DEFAULT = 4.9
const PITCH_DEFAULT = 0.56

const YAW_PER_PIXEL = 0.005
const PITCH_PER_PIXEL = 0.0035
const ZOOM_PER_PIXEL = 0.012
const FOLLOW_LAMBDA = 12
const CAMERA_CLEARANCE = 0.4

/**
 * Third-person orbit around the character's local up.
 * Heading is a tangent vector (parallel-transported as the prince walks),
 * pitch is a scalar off that tangent, and `camera.up` is the surface normal.
 * None of those are Euler angles, so crossing a pole does not flip the view.
 * Narrow viewports pull the camera back (`distance / aspect`) so a portrait
 * phone keeps the horizontal framing the vertical FOV was designed for.
 */
export class FollowCamera {
  private readonly camera: PerspectiveCamera
  private readonly surface: SurfaceProbe
  private readonly colliders: readonly SphereCollider[]

  private distance = DIST_DEFAULT
  private pitch = PITCH_DEFAULT
  private smoothPitch = PITCH_DEFAULT
  private smoothDistance = DIST_DEFAULT
  private ready = false

  private readonly camForward = new Vector3(0, 0, 1)
  private readonly smoothForward = new Vector3(0, 0, 1)
  private readonly pivot = new Vector3()
  private readonly desired = new Vector3()
  private readonly radial = new Vector3()
  private readonly rayDir = new Vector3()
  private readonly offset = new Vector3()
  private readonly delta = new Quaternion()

  constructor(
    camera: PerspectiveCamera,
    surface: SurfaceProbe,
    colliders: readonly SphereCollider[],
  ) {
    this.camera = camera
    this.surface = surface
    this.colliders = colliders
  }

  /** Put the camera behind `forward` (already tangent to `up`). */
  align(up: Vector3, forward: Vector3): void {
    this.camForward.copy(forward)
    this.projectTangent(this.camForward, up)
    this.smoothForward.copy(this.camForward)
  }

  /** Carry the orbit with the body as it slides across the sphere. */
  transport(delta: Quaternion): void {
    this.camForward.applyQuaternion(delta)
    this.smoothForward.applyQuaternion(delta)
  }

  update(
    dt: number,
    lookX: number,
    lookY: number,
    zoom: number,
    position: Vector3,
    up: Vector3,
  ): void {
    // Transport can leave a little normal drift. Flatten before applying the mouse.
    this.projectTangent(this.camForward, up)
    if (lookX !== 0) {
      // Drag right swings the camera to its right (orbit grab).
      this.delta.setFromAxisAngle(up, -lookX * YAW_PER_PIXEL)
      this.camForward.applyQuaternion(this.delta)
      this.projectTangent(this.camForward, up)
    }

    if (lookY !== 0) {
      this.pitch = clamp(this.pitch - lookY * PITCH_PER_PIXEL, PITCH_MIN, PITCH_MAX)
    }
    if (zoom !== 0) {
      const zoomPixels = clamp(zoom, -220, 220)
      this.distance = clamp(this.distance + zoomPixels * ZOOM_PER_PIXEL, DIST_MIN, DIST_MAX)
    }

    const framed = framedDistance(this.distance, this.camera.aspect)
    if (!this.ready) {
      this.smoothForward.copy(this.camForward)
      this.smoothPitch = this.pitch
      this.smoothDistance = framed
      this.ready = true
    } else {
      const t = 1 - Math.exp(-FOLLOW_LAMBDA * dt)
      this.smoothForward.lerp(this.camForward, t)
      this.projectTangent(this.smoothForward, up)
      this.smoothPitch += (this.pitch - this.smoothPitch) * t
      this.smoothDistance += (framed - this.smoothDistance) * t
    }

    const sinP = Math.sin(this.smoothPitch)
    const cosP = Math.cos(this.smoothPitch)
    this.pivot.copy(position).addScaledVector(up, CHARACTER_LOOK_HEIGHT)
    this.desired
      .copy(this.pivot)
      .addScaledVector(up, this.smoothDistance * sinP)
      .addScaledVector(this.smoothForward, -this.smoothDistance * cosP)

    this.liftOut(this.desired)
    this.pullBeforeSurface(this.pivot, this.desired)
    this.pullBeforeColliders(this.pivot, this.desired)
    this.liftOut(this.desired)

    // Surface normal, not world +Y: lookAt stays continuous through both poles.
    this.camera.up.copy(up)
    this.camera.position.copy(this.desired)
    this.camera.lookAt(this.pivot)
    this.camera.updateMatrixWorld()
  }

  private projectTangent(vector: Vector3, up: Vector3): void {
    vector.addScaledVector(up, -vector.dot(up))
    if (vector.lengthSq() < 1e-10) {
      vector.set(1, 0, 0)
      vector.addScaledVector(up, -vector.dot(up))
      if (vector.lengthSq() < 1e-10) {
        vector.set(0, 0, 1)
        vector.addScaledVector(up, -vector.dot(up))
      }
    }
    vector.normalize()
  }

  /** Push a point that landed inside the asteroid back out along its own radius. */
  private liftOut(pos: Vector3): void {
    const len = pos.length()
    if (len < 1e-5) return
    this.radial.copy(pos).multiplyScalar(1 / len)
    const minLen = this.surface.radiusAlong(this.radial) + CAMERA_CLEARANCE
    if (len < minLen) pos.multiplyScalar(minLen / len)
  }

  /** If a bulge sits between the chest and the lens, stop short of it. */
  private pullBeforeSurface(pivot: Vector3, pos: Vector3): void {
    this.rayDir.subVectors(pos, pivot)
    const dist = this.rayDir.length()
    if (dist < 1e-4) return
    this.rayDir.multiplyScalar(1 / dist)
    const t = this.surface.raycast(pivot, this.rayDir)
    if (t < dist && t > 0.2) {
      const keep = Math.min(dist, Math.max(1.2, t - 0.3))
      pos.copy(pivot).addScaledVector(this.rayDir, keep)
      this.liftOut(pos)
    }
  }

  /** Stop the lens short of a prop sphere. Ignores spheres the pivot is already inside. */
  private pullBeforeColliders(pivot: Vector3, pos: Vector3): void {
    this.rayDir.subVectors(pos, pivot)
    const dist = this.rayDir.length()
    if (dist < 1e-4) return
    this.rayDir.multiplyScalar(1 / dist)
    let limit = dist
    for (let i = 0; i < this.colliders.length; i++) {
      const collider = this.colliders[i]
      this.offset.subVectors(pivot, collider.center)
      const radius = collider.radius
      const c = this.offset.lengthSq() - radius * radius
      if (c < 0) continue
      const b = this.offset.dot(this.rayDir)
      const disc = b * b - c
      if (disc < 0) continue
      const tNear = -b - Math.sqrt(disc)
      if (tNear > 0.15 && tNear < limit) limit = tNear
    }
    if (limit < dist) {
      const keep = Math.max(1.15, limit - 0.12)
      pos.copy(pivot).addScaledVector(this.rayDir, Math.min(dist, keep))
    }
  }
}

/**
 * Vertical FOV stays 40°. Below a square viewport the horizontal FOV collapses,
 * so the orbit distance grows by 1/aspect and the narrow side keeps the framing
 * the tall side already had. Recomputed every frame so resize keeps up.
 */
export function framedDistance(distance: number, aspect: number): number {
  if (!(aspect > 0) || aspect >= 1) return distance
  return distance / aspect
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
