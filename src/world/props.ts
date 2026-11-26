import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import { palette } from '../config/palette'
import { frameFromUp } from '../math/frameFromUp'
import { createSolidMesh, mergeWorldMeshes, type SolidPart } from '../render/solidMesh'
import type { SphereCollider } from './collision'
import { SURFACE_CLEARANCE, type SurfaceProbe } from './surfaceProbe'

const _scale = new Vector3(1, 1, 1)
const _hint = new Vector3(1, 0, 0.2)

export interface SurfaceAnchor {
  readonly id: string
  readonly mesh: Mesh
  /** World-space base. For placed props this is `mesh.position` itself. */
  readonly center: Vector3
  /** Outward surface normal. Sunset mutates the chair's copy. */
  readonly up: Vector3
  readonly collider: SphereCollider
}

export interface VolcanoAnchor extends SurfaceAnchor {
  readonly active: boolean
  /** Crater height above the surface, along `up`. Smoke starts here. */
  readonly crown: number
}

export interface PlanetProps {
  readonly group: Group
  readonly colliders: readonly SphereCollider[]
  readonly rose: SurfaceAnchor
  readonly dome: Mesh
  readonly volcanoMesh: Mesh
  readonly volcanoes: readonly VolcanoAnchor[]
  readonly baobab: SurfaceAnchor
  readonly chair: SurfaceAnchor
  update(dt: number): void
}

interface VolcanoSpec {
  id: string
  direction: Vector3
  height: number
  radius: number
  active: boolean
}

interface Puff {
  origin: Vector3
  up: Vector3
  phase: number
  speed: number
  baseScale: number
}

/**
 * Rose, three volcanoes, a baobab sprout, and the sunset chair.
 * Collision spheres stay where PR 2 put them. Smoke is one instanced mesh
 * so the two waking volcanoes do not each cost a draw call.
 */
export function createProps(surface: SurfaceProbe): PlanetProps {
  const group = new Group()
  group.name = 'props'
  const colliders: SphereCollider[] = []

  const roseMesh = createSolidMesh(roseParts(), 'rose')
  const rose = placeAnchor(roseMesh, new Vector3(0.82, 0.5, 0.42), surface, 'rose', 0.62)
  group.add(rose.mesh)
  colliders.push(rose.collider)

  const dome = glassDome()
  dome.position.copy(rose.mesh.position)
  dome.quaternion.copy(rose.mesh.quaternion)
  group.add(dome)

  const volcanoes = createVolcanoes(surface, group, colliders)
  const smoke = createSmoke(volcanoes.anchors)
  group.add(smoke.mesh)

  const baobabMesh = createSolidMesh(baobabParts(), 'baobab')
  const baobab = placeAnchor(baobabMesh, new Vector3(0.9, 0.22, -0.18), surface, 'baobab', 0.36)
  group.add(baobab.mesh)
  colliders.push(baobab.collider)

  // Rose, volcanoes, and the sprout never move, so they share one draw
  // (and one shadow draw). The hidden meshes remain for ray picks.
  group.add(mergeWorldMeshes([rose.mesh, volcanoes.mesh, baobab.mesh], 'static-props'))

  const chairMesh = createSolidMesh(chairParts(), 'chair')
  const chair = placeAnchor(chairMesh, new Vector3(0.55, -0.78, 0.28), surface, 'chair', 0.32)
  group.add(chair.mesh)
  colliders.push(chair.collider)

  smoke.write(0)

  return {
    group,
    colliders,
    rose,
    dome,
    volcanoMesh: volcanoes.mesh,
    volcanoes: volcanoes.anchors,
    baobab,
    chair,
    update(dt: number): void {
      smoke.write(dt)
    },
  }
}

function placeAnchor(
  mesh: Mesh,
  direction: Vector3,
  surface: SurfaceProbe,
  id: string,
  radius: number,
): SurfaceAnchor {
  const up = direction.clone().normalize()
  mesh.position.copy(up).multiplyScalar(surface.radiusAlong(up) + SURFACE_CLEARANCE)
  frameFromUp(up, _hint, mesh.quaternion)
  const collider: SphereCollider = { name: id, center: mesh.position, radius }
  return { id, mesh, center: mesh.position, up, collider }
}

function createVolcanoes(
  surface: SurfaceProbe,
  group: Group,
  colliders: SphereCollider[],
): { mesh: Mesh; anchors: VolcanoAnchor[] } {
  const specs: readonly VolcanoSpec[] = [
    { id: 'volcano-0', direction: new Vector3(-0.22, 0.48, -0.78), height: 0.78, radius: 0.4, active: true },
    { id: 'volcano-1', direction: new Vector3(0.12, 0.36, -0.88), height: 0.96, radius: 0.46, active: true },
    { id: 'volcano-2', direction: new Vector3(-0.02, 0.22, -0.95), height: 0.62, radius: 0.34, active: false },
  ]
  const ember = new Color(palette.dustyRose).multiplyScalar(0.72)
  const plug = new Color(palette.mistGray).lerp(new Color(palette.hazeBlue), 0.2)
  const parts: SolidPart[] = []
  const drafted: Omit<VolcanoAnchor, 'mesh'>[] = []

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]
    const up = spec.direction.clone().normalize()
    const position = up.clone().multiplyScalar(surface.radiusAlong(up) + SURFACE_CLEARANCE)
    const quaternion = frameFromUp(up, _hint, new Quaternion())
    const matrix = new Matrix4().compose(position, quaternion, _scale)

    const cone = new ConeGeometry(spec.radius, spec.height, 5)
    cone.translate(0, spec.height / 2, 0)
    parts.push({ geometry: cone, color: coneColor(spec.active), matrix })

    const cap = new SphereGeometry(spec.radius * 0.3, 5, 3)
    cap.translate(0, spec.height * 0.84, 0)
    parts.push({
      geometry: cap,
      color: spec.active ? ember : plug,
      matrix: matrix.clone(),
    })

    const collider: SphereCollider = {
      name: spec.id,
      center: position,
      radius: spec.radius + 0.08,
    }
    colliders.push(collider)
    drafted.push({
      id: spec.id,
      center: position,
      up,
      collider,
      active: spec.active,
      crown: spec.height * 0.78,
    })
  }

  const mesh = createSolidMesh(parts, 'volcanoes')
  group.add(mesh)
  const anchors = drafted.map((draft) => ({ ...draft, mesh }))
  return { mesh, anchors }
}

function coneColor(active: boolean): Color {
  if (active) return new Color(palette.mutedSage).multiplyScalar(0.86)
  return new Color(palette.mistGray).lerp(new Color(palette.hazeBlue), 0.22).multiplyScalar(0.96)
}

function createSmoke(volcanoes: readonly VolcanoAnchor[]): { mesh: InstancedMesh; write(dt: number): void } {
  const puffs: Puff[] = []
  for (let i = 0; i < volcanoes.length; i++) {
    const volcano = volcanoes[i]
    if (!volcano.active) continue
    const crater = volcano.center.clone().addScaledVector(volcano.up, volcano.crown)
    for (let k = 0; k < 3; k++) {
      puffs.push({
        origin: crater,
        up: volcano.up,
        phase: (k + i * 0.37) % 1,
        speed: 0.16 + k * 0.035,
        baseScale: 0.1 + k * 0.028,
      })
    }
  }

  const material = new MeshLambertMaterial({
    color: new Color(palette.mistGray).lerp(new Color(palette.offWhite), 0.42),
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    flatShading: true,
  })
  const mesh = new InstancedMesh(new SphereGeometry(1, 5, 4), material, puffs.length)
  mesh.name = 'smoke'
  mesh.castShadow = false
  mesh.receiveShadow = false
  // Instance matrices sit on the craters. The unit-sphere bounds at the
  // origin would be culled for the whole life of the plume.
  mesh.frustumCulled = false
  mesh.renderOrder = 1

  const dummy = new Object3D()
  const offset = new Vector3()

  return {
    mesh,
    write(dt: number): void {
      for (let i = 0; i < puffs.length; i++) {
        const puff = puffs[i]
        puff.phase = (puff.phase + dt * puff.speed) % 1
        const rise = puff.phase
        const fade = Math.sin(rise * Math.PI)
        offset.copy(puff.up).multiplyScalar(0.08 + rise * 0.58)
        dummy.position.copy(puff.origin).add(offset)
        dummy.scale.setScalar(Math.max(0.02, puff.baseScale * (0.4 + 0.85 * fade)))
        dummy.rotation.set(0, 0, 0)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
    },
  }
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
