import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import { palette } from '../config/palette'
import { frameFromUp } from '../math/frameFromUp'
import { createSolidMesh, type SolidPart } from '../render/solidMesh'
import type { SphereCollider } from './collision'
import { SURFACE_CLEARANCE, type SurfaceProbe } from './surfaceProbe'

const _scale = new Vector3(1, 1, 1)
const _hint = new Vector3(1, 0, 0.2)

export interface PlanetProps {
  readonly group: Group
  readonly colliders: readonly SphereCollider[]
}

/**
 * Placeholder set dressing so the prince has something to walk around.
 * PR 1 shipped the asteroid only; rose, volcanoes, baobab and chair land here
 * because spherical collision needs them. No interaction yet (that is PR 3).
 */
export function createProps(surface: SurfaceProbe): PlanetProps {
  const group = new Group()
  group.name = 'props'
  const colliders: SphereCollider[] = []

  const rose = place(
    createSolidMesh(roseParts(), 'rose'),
    new Vector3(0.82, 0.5, 0.42),
    surface,
  )
  group.add(rose.mesh)
  colliders.push({ name: 'dome', center: rose.position.clone(), radius: 0.62 })

  const dome = glassDome()
  dome.position.copy(rose.mesh.position)
  dome.quaternion.copy(rose.mesh.quaternion)
  group.add(dome)

  const volcanoDirs = [
    new Vector3(-0.22, 0.48, -0.78),
    new Vector3(0.12, 0.36, -0.88),
    new Vector3(-0.02, 0.22, -0.95),
  ]
  const volcanoHeights = [0.78, 0.96, 0.62]
  const volcanoRadii = [0.4, 0.46, 0.34]
  const rock = new Color(palette.mutedSage).multiplyScalar(0.86)
  const volcanoParts: SolidPart[] = []
  for (let i = 0; i < volcanoDirs.length; i++) {
    const geo = new ConeGeometry(volcanoRadii[i], volcanoHeights[i], 5)
    geo.translate(0, volcanoHeights[i] / 2, 0)
    const placed = placement(volcanoDirs[i], surface)
    volcanoParts.push({
      geometry: geo,
      color: rock,
      matrix: new Matrix4().compose(placed.position, placed.quaternion, _scale),
    })
    colliders.push({
      name: 'volcano',
      center: placed.position.clone(),
      radius: volcanoRadii[i] + 0.08,
    })
  }
  group.add(createSolidMesh(volcanoParts, 'volcanoes'))

  const baobab = place(createSolidMesh(baobabParts(), 'baobab'), new Vector3(0.9, 0.22, -0.18), surface)
  group.add(baobab.mesh)
  colliders.push({ name: 'baobab', center: baobab.position.clone(), radius: 0.36 })

  const chair = place(
    createSolidMesh(chairParts(), 'chair'),
    new Vector3(0.55, -0.78, 0.28),
    surface,
  )
  group.add(chair.mesh)
  colliders.push({ name: 'chair', center: chair.position.clone(), radius: 0.32 })

  return { group, colliders }
}

function place(mesh: Mesh, direction: Vector3, surface: SurfaceProbe): { mesh: Mesh; position: Vector3 } {
  const placed = placement(direction, surface)
  mesh.position.copy(placed.position)
  mesh.quaternion.copy(placed.quaternion)
  return { mesh, position: placed.position }
}

function placement(direction: Vector3, surface: SurfaceProbe): { position: Vector3; quaternion: Quaternion } {
  const up = direction.clone().normalize()
  const position = up.clone().multiplyScalar(surface.radiusAlong(up) + SURFACE_CLEARANCE)
  const quaternion = frameFromUp(up, _hint, new Quaternion())
  return { position, quaternion }
}

function roseParts(): SolidPart[] {
  const stem = new Color(palette.mutedSage).multiplyScalar(0.9)
  const bloom = new Color(palette.dustyRose)
  const leaf = new Color(palette.mutedSage)
  return [
    {
      geometry: new CylinderGeometry(0.02, 0.03, 0.36, 5),
      color: stem,
      x: 0,
      y: 0.18,
      z: 0,
    },
    {
      geometry: new BoxGeometry(0.12, 0.018, 0.06),
      color: leaf,
      x: 0.07,
      y: 0.2,
      z: 0,
      rz: 0.4,
    },
    { geometry: new IcosahedronGeometry(0.09, 0), color: bloom, x: 0, y: 0.4, z: 0 },
    { geometry: new IcosahedronGeometry(0.055, 0), color: bloom, x: 0.02, y: 0.47, z: 0.02 },
  ]
}

function glassDome(): Mesh {
  const geometry = new SphereGeometry(0.56, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2)
  const material = new MeshLambertMaterial({
    color: palette.hazeBlue,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    flatShading: true,
  })
  const dome = new Mesh(geometry, material)
  dome.name = 'dome'
  dome.castShadow = false
  dome.receiveShadow = false
  dome.renderOrder = 2
  return dome
}

function baobabParts(): SolidPart[] {
  const trunk = new Color(palette.mutedSage).multiplyScalar(0.72)
  const canopy = new Color(palette.mutedSage).lerp(new Color(palette.mistGray), 0.22)
  return [
    {
      geometry: new CylinderGeometry(0.045, 0.075, 0.72, 5),
      color: trunk,
      x: 0,
      y: 0.36,
      z: 0,
    },
    { geometry: new SphereGeometry(0.2, 5, 4), color: canopy, x: 0, y: 0.82, z: 0 },
    { geometry: new SphereGeometry(0.14, 5, 4), color: canopy, x: 0.14, y: 0.74, z: 0.04 },
    { geometry: new SphereGeometry(0.12, 5, 4), color: canopy, x: -0.12, y: 0.76, z: -0.05 },
  ]
}

function chairParts(): SolidPart[] {
  const cloth = new Color(palette.offWhite)
  const wood = new Color(palette.mistGray).multiplyScalar(0.82)
  const leg = (x: number, z: number): SolidPart => ({
    geometry: new BoxGeometry(0.03, 0.16, 0.03),
    color: wood,
    x,
    y: 0.08,
    z,
  })
  return [
    leg(-0.08, -0.07),
    leg(0.08, -0.07),
    leg(-0.08, 0.07),
    leg(0.08, 0.07),
    { geometry: new BoxGeometry(0.22, 0.035, 0.2), color: cloth, x: 0, y: 0.175, z: 0 },
    { geometry: new BoxGeometry(0.22, 0.22, 0.03), color: cloth, x: 0, y: 0.3, z: -0.085 },
  ]
}
