import {
  BufferAttribute,
  Color,
  IcosahedronGeometry,
  Mesh,
  MeshLambertMaterial,
  Vector3,
} from 'three'
import { palette } from '../config/palette'

/** B612's radius in world units. Later movement code can import this. */
export const PLANET_RADIUS = 5

const sage = new Color(palette.mutedSage)
const paleMeadow = new Color(palette.offWhite)
const mistPatch = new Color(palette.mistGray)

/** Deterministic 0..1 hash so the silhouette stays the same between reloads. */
function hash3(x: number, y: number, z: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123
  return n - Math.floor(n)
}

/**
 * Low-poly asteroid: a coarse icosahedron with a little radial noise,
 * flat face normals, and muted facet colors.
 */
export function createPlanet(): Mesh {
  const geometry = new IcosahedronGeometry(PLANET_RADIUS, 2)
  const position = geometry.getAttribute('position')
  const vertex = new Vector3()

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i)
    const length = vertex.length() || 1
    const nx = vertex.x / length
    const ny = vertex.y / length
    const nz = vertex.z / length
    const displacement = (hash3(nx, ny, nz) - 0.5) * 0.65
    const radius = PLANET_RADIUS + displacement
    position.setXYZ(i, nx * radius, ny * radius, nz * radius)
  }
  position.needsUpdate = true

  // IcosahedronGeometry is already non-indexed, so each face owns its vertices.
  const colors = new Float32Array(position.count * 3)
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  const color = new Color()

  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i)
    b.fromBufferAttribute(position, i + 1)
    c.fromBufferAttribute(position, i + 2)
    const cx = (a.x + b.x + c.x) / 3
    const cy = (a.y + b.y + c.y) / 3
    const cz = (a.z + b.z + c.z) / 3
    const len = Math.hypot(cx, cy, cz) || 1
    const tint = hash3(cx / len, cy / len, cz / len)

    color.copy(sage)
    if (tint > 0.72) color.lerp(paleMeadow, 0.2)
    else if (tint < 0.22) color.lerp(mistPatch, 0.16)

    for (let k = 0; k < 3; k++) {
      const offset = (i + k) * 3
      colors[offset] = color.r
      colors[offset + 1] = color.g
      colors[offset + 2] = color.b
    }
  }

  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  // flatShading rebuilds face normals from screen derivatives, so the
  // smoothed normals computeVertexNormals would write are never sampled.
  geometry.computeBoundingSphere()

  const material = new MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
  })

  const planet = new Mesh(geometry, material)
  planet.name = 'b612'
  planet.castShadow = true
  planet.receiveShadow = true
  // Fixed pose. The follow camera orbits the prince; this mesh does not spin.
  planet.rotation.y = 0.55
  return planet
}
