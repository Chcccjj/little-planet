import { Mesh } from 'three'
import { describe, expect, it } from 'vitest'
import { SurfaceProbe } from '../../src/world/surfaceProbe'
import { createPlanet } from '../../src/world/planet'
import { createProps } from '../../src/world/props'

describe('static props', () => {
  it('shares one visible mesh and keeps the hidden meshes for ray picks', () => {
    const props = createProps(new SurfaceProbe(createPlanet()))
    const visible: string[] = []
    const hidden: string[] = []
    props.group.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      if (mesh.visible) visible.push(mesh.name)
      else hidden.push(mesh.name)
    })
    expect(visible.sort()).toEqual(['chair', 'dome', 'smoke', 'static-props'])
    expect(hidden.sort()).toEqual(['baobab', 'rose', 'volcanoes'])

    const baked = props.group.getObjectByName('static-props') as Mesh
    expect(baked.castShadow).toBe(true)
    expect(baked.geometry.boundingSphere?.radius).toBeGreaterThan(1)
    expect(props.rose.mesh.geometry.getAttribute('position').count).toBeGreaterThan(0)
    expect(props.volcanoMesh.visible).toBe(false)
  })
})
