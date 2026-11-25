import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Euler,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export interface SolidPart {
  geometry: BufferGeometry
  color: Color
  /** Full bake transform. When set, the translation / euler / scale fields are ignored. */
  matrix?: Matrix4
  x?: number
  y?: number
  z?: number
  rx?: number
  ry?: number
  rz?: number
  sx?: number
  sy?: number
  sz?: number
}

const _matrix = new Matrix4()
const _position = new Vector3()
const _quaternion = new Quaternion()
const _scale = new Vector3()
const _euler = new Euler()

/**
 * One flat-shaded Lambert mesh for a pile of primitive parts.
 * Merging keeps the prince and the props to a handful of draw calls.
 * Init-time only — not for the frame loop.
 */
export function createSolidMesh(parts: readonly SolidPart[], name: string): Mesh {
  const baked: BufferGeometry[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const source = part.geometry
    source.applyMatrix4(matrixFor(part))
    const flat = source.index === null ? source : source.toNonIndexed()
    if (flat !== source) source.dispose()
    paint(flat, part.color)
    baked.push(flat)
  }

  const merged = mergeGeometries(baked, false)
  for (let i = 0; i < baked.length; i++) baked[i].dispose()
  merged.computeVertexNormals()

  const mesh = new Mesh(
    merged,
    new MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
    }),
  )
  mesh.name = name
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function matrixFor(part: SolidPart): Matrix4 {
  if (part.matrix) return _matrix.copy(part.matrix)
  _position.set(part.x ?? 0, part.y ?? 0, part.z ?? 0)
  _euler.set(part.rx ?? 0, part.ry ?? 0, part.rz ?? 0)
  _quaternion.setFromEuler(_euler)
  _scale.set(part.sx ?? 1, part.sy ?? 1, part.sz ?? 1)
  return _matrix.compose(_position, _quaternion, _scale)
}

function paint(geometry: BufferGeometry, color: Color): void {
  const count = geometry.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const offset = i * 3
    colors[offset] = color.r
    colors[offset + 1] = color.g
    colors[offset + 2] = color.b
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
}
