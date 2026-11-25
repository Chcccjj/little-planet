import { Matrix4, Quaternion, Vector3 } from 'three'

const _up = new Vector3()
const _forward = new Vector3()
const _right = new Vector3()
const _basis = new Matrix4()

/**
 * Orientation whose local +Y is the surface normal and local +Z is
 * `forwardHint` flattened onto the tangent plane.
 * Quaternion only — no latitude/longitude — so the frame stays valid at the poles.
 */
export function frameFromUp(up: Vector3, forwardHint: Vector3, out: Quaternion): Quaternion {
  _up.copy(up).normalize()
  _forward.copy(forwardHint)
  _forward.addScaledVector(_up, -_forward.dot(_up))
  if (_forward.lengthSq() < 1e-8) {
    _forward.set(0, 0, 1)
    _forward.addScaledVector(_up, -_forward.dot(_up))
    if (_forward.lengthSq() < 1e-8) {
      _forward.set(1, 0, 0)
      _forward.addScaledVector(_up, -_forward.dot(_up))
    }
  }
  _forward.normalize()
  // Local X (right) = up × forward, so the basis is right-handed with +Z forward.
  _right.crossVectors(_up, _forward).normalize()
  _basis.makeBasis(_right, _up, _forward)
  return out.setFromRotationMatrix(_basis)
}
