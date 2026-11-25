import { PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { frameFromUp } from '../math/frameFromUp'
import type { SphereCollider } from '../world/collision'
import { SURFACE_CLEARANCE, type SurfaceProbe } from '../world/surfaceProbe'
import { CHARACTER_RADIUS, type CharacterVisual } from './createCharacter'

/** Near the top of B612, clear of the props, facing the south tangent. */
export const SPAWN_DIRECTION = new Vector3(0.25, 0.86, 0.45)

const WALK_SPEED = 1.45
const TURN_RATE = 10
const MAX_PUSH = 0.75

const _south = new Vector3(0, -1, 0)

/**
 * Walks on the sphere by rotating a quaternion frame.
 * Local +Y stays the radial up (spherical gravity) and local +Z faces travel.
 * There is no latitude/longitude, so the poles are ordinary points.
 */
export class Locomotion {
  readonly position = new Vector3()
  readonly up = new Vector3(0, 1, 0)
  readonly forward = new Vector3(0, 0, 1)
  /**
   * World rotation applied to the body this frame, excluding the turn-to-face yaw.
   * The follow camera parallel-transports its heading by this so it stays put
   * relative to the ground without spinning when the prince turns in place.
   */
  readonly transport = new Quaternion()

  private readonly orientation = new Quaternion()
  private readonly character: CharacterVisual
  private readonly surface: SurfaceProbe
  private readonly colliders: readonly SphereCollider[]
  private currentRadius = 5

  private readonly camForward = new Vector3()
  private readonly camRight = new Vector3()
  private readonly moveDir = new Vector3()
  private readonly desiredForward = new Vector3()
  private readonly facing = new Vector3()
  private readonly axis = new Vector3()
  private readonly delta = new Quaternion()
  private readonly offset = new Vector3()
  private readonly push = new Vector3()
  private readonly cross = new Vector3()

  constructor(
    character: CharacterVisual,
    surface: SurfaceProbe,
    colliders: readonly SphereCollider[],
    spawnDirection: Vector3 = SPAWN_DIRECTION,
  ) {
    this.character = character
    this.surface = surface
    this.colliders = colliders
    frameFromUp(spawnDirection, _south, this.orientation)
    this.plantOnSurface()
    this.refreshBasis()
    this.syncRoot()
  }

  update(dt: number, moveX: number, moveY: number, camera: PerspectiveCamera): void {
    this.transport.identity()
    const inputMag = Math.hypot(moveX, moveY)
    const moving = inputMag > 1e-4

    if (moving) {
      this.up.set(0, 1, 0).applyQuaternion(this.orientation)
      this.cameraBasis(camera)
      this.moveDir.copy(this.camForward).multiplyScalar(moveY / inputMag)
      this.moveDir.addScaledVector(this.camRight, moveX / inputMag)
      if (this.moveDir.lengthSq() > 1e-8) {
        this.moveDir.normalize()
        this.slide(this.up, this.moveDir, WALK_SPEED * dt * Math.min(inputMag, 1))
        this.up.set(0, 1, 0).applyQuaternion(this.orientation)
        this.desiredForward.copy(this.moveDir)
        this.desiredForward.addScaledVector(this.up, -this.desiredForward.dot(this.up))
        if (this.desiredForward.lengthSq() > 1e-8) {
          this.desiredForward.normalize()
          this.turnToward(this.desiredForward, dt)
        }
      }
    }

    this.plantOnSurface()
    this.resolveCollisions()
    this.refreshBasis()
    this.syncRoot()
    this.character.updateVisual(dt, moving)
  }

  private cameraBasis(camera: PerspectiveCamera): void {
    camera.getWorldDirection(this.camForward)
    this.camForward.addScaledVector(this.up, -this.camForward.dot(this.up))
    if (this.camForward.lengthSq() < 1e-8) {
      this.camForward.set(0, 0, 1).applyQuaternion(this.orientation)
    } else {
      this.camForward.normalize()
    }
    // Camera right: look × up. For up=+Y and look=-Z this is +X.
    this.camRight.crossVectors(this.camForward, this.up)
    if (this.camRight.lengthSq() < 1e-8) {
      this.camRight.set(1, 0, 0).applyQuaternion(this.orientation)
    } else {
      this.camRight.normalize()
    }
  }

  /** Rotate the frame so `up` turns toward `tangent` by `distance` along the surface. */
  private slide(up: Vector3, tangent: Vector3, distance: number): void {
    if (distance < 1e-8) return
    this.axis.crossVectors(up, tangent)
    const axisLen = this.axis.length()
    if (axisLen < 1e-8) return
    this.axis.multiplyScalar(1 / axisLen)
    const radius = Math.max(this.currentRadius, 0.5)
    this.delta.setFromAxisAngle(this.axis, distance / radius)
    this.orientation.premultiply(this.delta).normalize()
    this.transport.premultiply(this.delta)
  }

  private turnToward(desiredForward: Vector3, dt: number): void {
    this.facing.set(0, 0, 1).applyQuaternion(this.orientation)
    this.cross.crossVectors(this.facing, desiredForward)
    const yaw = Math.atan2(this.cross.dot(this.up), this.facing.dot(desiredForward))
    const maxStep = TURN_RATE * dt
    const applied = Math.max(-maxStep, Math.min(maxStep, yaw))
    if (Math.abs(applied) < 1e-5) return
    this.delta.setFromAxisAngle(this.up, applied)
    // Facing yaw is not part of `transport`, so the camera doesn't chase the nose.
    this.orientation.premultiply(this.delta).normalize()
  }

  private resolveCollisions(): void {
    for (let iteration = 0; iteration < 3; iteration++) {
      let pushed = false
      for (let i = 0; i < this.colliders.length; i++) {
        const collider = this.colliders[i]
        this.offset.subVectors(this.position, collider.center)
        const distSq = this.offset.lengthSq()
        const minDist = collider.radius + CHARACTER_RADIUS
        if (distSq >= minDist * minDist) continue

        this.up.set(0, 1, 0).applyQuaternion(this.orientation)
        let dist = 0
        if (distSq < 1e-10) {
          // Exactly on the collider center: any tangent step leaves it.
          this.facing.set(0, 0, 1).applyQuaternion(this.orientation)
          this.push.crossVectors(this.up, this.facing)
          if (this.push.lengthSq() < 1e-8) this.push.set(1, 0, 0)
        } else {
          dist = Math.sqrt(distSq)
          const radial = this.offset.dot(this.up)
          this.push.copy(this.offset).addScaledVector(this.up, -radial)
          if (this.push.lengthSq() < 1e-8) {
            this.facing.set(0, 0, 1).applyQuaternion(this.orientation)
            this.push.crossVectors(this.up, this.facing)
            if (this.push.lengthSq() < 1e-8) this.push.set(1, 0, 0)
          }
        }
        this.push.normalize()
        const step = Math.min(minDist - dist + 0.002, MAX_PUSH)
        this.slide(this.up, this.push, step)
        this.plantOnSurface()
        pushed = true
      }
      if (!pushed) break
    }
  }

  private plantOnSurface(): void {
    this.up.set(0, 1, 0).applyQuaternion(this.orientation)
    this.currentRadius = this.surface.radiusAlong(this.up)
    this.position.copy(this.up).multiplyScalar(this.currentRadius + SURFACE_CLEARANCE)
  }

  private refreshBasis(): void {
    this.up.set(0, 1, 0).applyQuaternion(this.orientation)
    this.forward.set(0, 0, 1).applyQuaternion(this.orientation)
  }

  private syncRoot(): void {
    this.character.root.position.copy(this.position)
    this.character.root.quaternion.copy(this.orientation)
  }
}
