import type { Vector3 } from 'three'

/** Static bounding sphere in world space. Push-out collision only — no physics step. */
export interface SphereCollider {
  readonly name: string
  readonly center: Vector3
  readonly radius: number
}
