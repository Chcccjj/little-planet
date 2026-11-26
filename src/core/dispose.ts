import { BufferGeometry, Material, Mesh, Object3D, Texture, type WebGLRenderer } from 'three'

/** Release GPU buffers for every mesh under `root`. Shared geometries are freed once. */
export function disposeObject3D(root: Object3D): void {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()

  root.traverse((object) => {
    const mesh = object as Mesh
    if (mesh.geometry instanceof BufferGeometry && !geometries.has(mesh.geometry)) {
      geometries.add(mesh.geometry)
      mesh.geometry.dispose()
    }
    if (!mesh.material) return
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (let i = 0; i < list.length; i++) {
      const material = list[i]
      if (materials.has(material)) continue
      materials.add(material)
      disposeMaterial(material, textures)
    }
  })
}

function disposeMaterial(material: Material, textures: Set<Texture>): void {
  const record = material as unknown as Record<string, unknown>
  const keys = Object.keys(record)
  for (let i = 0; i < keys.length; i++) {
    const value = record[keys[i]]
    if (value instanceof Texture && !textures.has(value)) {
      textures.add(value)
      value.dispose()
    }
  }
  material.dispose()
}

export function disposeRenderer(renderer: WebGLRenderer): void {
  renderer.dispose()
  renderer.domElement.remove()
}
