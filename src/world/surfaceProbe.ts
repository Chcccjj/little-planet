import { BufferAttribute, Mesh, Quaternion, Vector3 } from 'three'
import { PLANET_RADIUS } from './planet'

/** Feet and prop bases sit this far off the facets so soles don't z-fight. */
export const SURFACE_CLEARANCE = 0.02

/**
 * Allocation-free rays against the static planet mesh.
 * The asteroid is rotated once and never scaled, so a quaternion takes
 * world rays into geometry space and the hit distance is unchanged.
 */
export class SurfaceProbe {
  private readonly positions: BufferAttribute
  private readonly index: BufferAttribute | null
  private readonly inverseRotation = new Quaternion()

  private readonly origin = new Vector3()
  private readonly direction = new Vector3()
  private readonly localDir = new Vector3()
  private readonly a = new Vector3()
  private readonly b = new Vector3()
  private readonly c = new Vector3()
  private readonly ab = new Vector3()
  private readonly ac = new Vector3()
  private readonly pvec = new Vector3()
  private readonly tvec = new Vector3()
  private readonly qvec = new Vector3()

  constructor(planet: Mesh) {
    planet.updateMatrixWorld(true)
    planet.getWorldQuaternion(this.inverseRotation).invert()
    const position = planet.geometry.getAttribute('position')
    if (!(position instanceof BufferAttribute)) {
      throw new Error('Planet position attribute is not a BufferAttribute')
    }
    this.positions = position
    this.index = planet.geometry.index
  }

  /** Distance from the planet origin to the surface along a world direction. */
  radiusAlong(worldDirection: Vector3): number {
    this.localDir.copy(worldDirection)
    const len = this.localDir.length()
    if (len < 1e-8) return PLANET_RADIUS
    this.localDir.multiplyScalar(1 / len).applyQuaternion(this.inverseRotation)
    const reach = PLANET_RADIUS + 2
    this.origin.copy(this.localDir).multiplyScalar(reach)
    this.direction.copy(this.localDir).negate()
    const t = this.raycastLocal(this.origin, this.direction)
    if (!Number.isFinite(t)) return PLANET_RADIUS
    return reach - t
  }

  /**
   * Nearest hit distance along a world ray. Infinity when the ray misses.
   * `worldDirection` does not need to be unit length.
   */
  raycast(worldOrigin: Vector3, worldDirection: Vector3): number {
    this.origin.copy(worldOrigin).applyQuaternion(this.inverseRotation)
    this.direction.copy(worldDirection).applyQuaternion(this.inverseRotation)
    const len = this.direction.length()
    if (len < 1e-8) return Infinity
    this.direction.multiplyScalar(1 / len)
    return this.raycastLocal(this.origin, this.direction)
  }

  private raycastLocal(origin: Vector3, direction: Vector3): number {
    const position = this.positions
    const index = this.index
    const count = index ? index.count : position.count
    let closest = Infinity

    for (let i = 0; i < count; i += 3) {
      const ia = index ? index.getX(i) : i
      const ib = index ? index.getX(i + 1) : i + 1
      const ic = index ? index.getX(i + 2) : i + 2
      this.a.fromBufferAttribute(position, ia)
      this.b.fromBufferAttribute(position, ib)
      this.c.fromBufferAttribute(position, ic)

      this.ab.subVectors(this.b, this.a)
      this.ac.subVectors(this.c, this.a)
      this.pvec.crossVectors(direction, this.ac)
      const det = this.ab.dot(this.pvec)
      if (det > -1e-8 && det < 1e-8) continue
      const invDet = 1 / det
      this.tvec.subVectors(origin, this.a)
      const u = this.tvec.dot(this.pvec) * invDet
      if (u < 0 || u > 1) continue
      this.qvec.crossVectors(this.tvec, this.ab)
      const v = direction.dot(this.qvec) * invDet
      if (v < 0 || u + v > 1) continue
      const t = this.ac.dot(this.qvec) * invDet
      if (t > 1e-4 && t < closest) closest = t
    }

    return closest
  }
}
