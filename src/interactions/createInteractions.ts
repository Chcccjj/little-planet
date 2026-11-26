import {
  Mesh,
  Raycaster,
  Vector2,
  Vector3,
  type Intersection,
  type Object3D,
  type PerspectiveCamera,
} from 'three'
import { CHARACTER_RADIUS } from '../character/createCharacter'
import { clientToNdc, ndcToClient, type ScreenRect } from '../math/screen'
import type { SceneContext } from '../scene/createScene'
import type { SurfaceProbe } from '../world/surfaceProbe'
import type { PlanetProps, VolcanoAnchor } from '../world/props'
import { createDialogue } from './dialogue'
import { createHint } from './hint'
import { lines } from './lines'
import { trackTaps } from './pointerTap'
import { createSunset } from './sunset'

/** Extra reach past the collision shell. The hint and the E key use it. A pointer tap does not. */
const REACH_MARGIN = 0.95
/** Forgiving radius for a thumb that lands beside a small prop. */
const SCREEN_SLOP_PX = 46
/** Planet hits this much closer than the prop count as the asteroid in the way. */
const OCCLUDE_SLACK = 0.05

interface Item {
  id: string
  lines: readonly string[]
  center: Vector3
  up: Vector3
  bodyRadius: number
  reach: number
  aimLift: number
  hintLift: number
  sunset: boolean
}

export interface InteractionState {
  dialogueOpen: boolean
  page: number
  pages: number
  text: string
  full: string
  typing: boolean
  sunset: number
  sunsetPlaying: boolean
  chair: { x: number; y: number; z: number }
  near: string | null
  lastTriggerId: string | null
  lastTriggerPointer: string | null
  lastAdvancePointer: string | null
}

export interface StandPoint {
  dx: number
  dy: number
  dz: number
  fx: number
  fy: number
  fz: number
}

export interface InteractionDebug {
  ids(): string[]
  stand(id: string): StandPoint | null
  project(id: string): { x: number; y: number } | null
  /** Same ray the pointer uses. Null when the planet is in the way or the pixel misses. */
  pick(clientX: number, clientY: number): string | null
  state(): InteractionState
  previewSunset(amount: number): void
  restoreSunset(): void
}

export interface Interactions {
  readonly blocksMovement: boolean
  /** Sunset is moving the light or the chair, so the shadow map must redraw. */
  readonly shadowDynamic: boolean
  readonly discoverable: number
  discoveredIds(): readonly string[]
  sunsetViews(): number
  restoreProgress(ids: readonly string[], sunsetViews: number): void
  resetProgress(): void
  /** Hide the proximity hint while the simulation is not running. */
  suspend(): void
  update(dt: number): void
  dispose(): void
  /** Present in dev builds. Production omits the framing and sweep helpers. */
  readonly debug?: InteractionDebug
}

/**
 * Proximity for the hint and the E key, ray picks for taps, and the dialogue.
 * Another prop is another Item; locomotion only sees `blocksMovement`.
 */
export function createInteractions(
  view: SceneContext,
  props: PlanetProps,
  surface: SurfaceProbe,
  planet: Mesh,
  getPosition: () => Vector3,
): Interactions {
  const items: Item[] = []
  const byId = new Map<string, Item>()
  const add = (item: Item) => {
    items.push(item)
    byId.set(item.id, item)
  }

  add(makeItem(props.rose, lines.rose, 0.34, 0.95, false))
  const volcanoItems: Item[] = []
  for (let i = 0; i < props.volcanoes.length; i++) {
    const volcano = props.volcanoes[i]
    const item = makeItem(volcano, scriptFor(volcano, i), 0.48, volcano.crown + 0.42, false)
    add(item)
    volcanoItems.push(item)
  }
  add(makeItem(props.baobab, lines.baobab, 0.55, 1.15, false))
  add(makeItem(props.chair, lines.chair, 0.22, 0.72, true))

  const rose = mustGet(byId, 'rose')
  const baobab = mustGet(byId, 'baobab')
  const chair = mustGet(byId, 'chair')
  const resolvers = new Map<Object3D, (point: Vector3) => Item>()
  resolvers.set(props.rose.mesh, () => rose)
  resolvers.set(props.dome, () => rose)
  resolvers.set(props.baobab.mesh, () => baobab)
  resolvers.set(props.chair.mesh, () => chair)
  resolvers.set(props.volcanoMesh, (point) => nearestVolcano(volcanoItems, point))
  const pickMeshes = [...resolvers.keys()]

  const sunset = createSunset({
    sun: view.sun,
    fill: view.fill,
    fog: view.fog,
    sky: view.sky,
    surface,
    chair: props.chair,
    colliders: props.colliders,
    avoid: getPosition,
    avoidRadius: CHARACTER_RADIUS,
  })
  const hint = createHint()
  const discovered = new Set<string>()
  let sunsetViews = 0
  let sunsetLatched = false
  let lastTriggerId: string | null = null
  let lastTriggerPointer: string | null = null
  let lastAdvancePointer: string | null = null

  const dialogue = createDialogue((via) => {
    lastAdvancePointer = via
  })

  const raycaster = new Raycaster()
  const ndc = new Vector2()
  const hits: Intersection[] = []
  const planetHits: Intersection[] = []
  const scratch = new Vector3()
  const camForward = new Vector3()
  const toPoint = new Vector3()
  let pixelX = 0
  let pixelY = 0

  const planetBlocks = (distance: number) =>
    planetHits.length > 0 && planetHits[0].distance + OCCLUDE_SLACK < distance

  const closest = (): Item | null => {
    const position = getPosition()
    let best: Item | null = null
    let bestD = Infinity
    for (let i = 0; i < items.length; i++) {
      const dist = position.distanceToSquared(items[i].center)
      if (dist <= items[i].reach * items[i].reach && dist < bestD) {
        best = items[i]
        bestD = dist
      }
    }
    return best
  }

  const canvasRect = (): ScreenRect | null => {
    const rect = view.renderer.domElement.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) return null
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  }

  const projectLift = (center: Vector3, up: Vector3, lift: number, camera: PerspectiveCamera): boolean => {
    const rect = canvasRect()
    if (!rect) return false
    camera.getWorldDirection(camForward)
    scratch.copy(center).addScaledVector(up, lift)
    toPoint.subVectors(scratch, camera.position)
    if (toPoint.dot(camForward) <= 0.15) return false
    scratch.project(camera)
    if (scratch.z < -1 || scratch.z > 1) return false
    const point = ndcToClient(scratch.x, scratch.y, rect)
    pixelX = point.x
    pixelY = point.y
    return true
  }

  const screenFallback = (clientX: number, clientY: number): Item | null => {
    const rect = canvasRect()
    if (!rect) return null
    let best: Item | null = null
    let bestD = SCREEN_SLOP_PX * SCREEN_SLOP_PX
    view.camera.getWorldDirection(camForward)
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      scratch.copy(item.center).addScaledVector(item.up, item.aimLift)
      toPoint.subVectors(scratch, view.camera.position)
      const aimDist = toPoint.length()
      if (aimDist < 1e-4 || toPoint.dot(camForward) <= 0.15) continue
      toPoint.multiplyScalar(1 / aimDist)
      raycaster.ray.set(view.camera.position, toPoint)
      planetHits.length = 0
      raycaster.intersectObject(planet, false, planetHits)
      if (planetBlocks(aimDist)) continue
      scratch.project(view.camera)
      const point = ndcToClient(scratch.x, scratch.y, rect)
      const dx = point.x - clientX
      const dy = point.y - clientY
      const dist = dx * dx + dy * dy
      if (dist <= bestD) {
        best = item
        bestD = dist
      }
    }
    return best
  }

  const pick = (clientX: number, clientY: number): Item | null => {
    const rect = canvasRect()
    if (!rect) return null
    const pointer = clientToNdc(clientX, clientY, rect)
    ndc.set(pointer.x, pointer.y)
    raycaster.setFromCamera(ndc, view.camera)
    planet.updateWorldMatrix(true, false)
    for (let i = 0; i < pickMeshes.length; i++) pickMeshes[i].updateWorldMatrix(true, false)
    hits.length = 0
    planetHits.length = 0
    raycaster.intersectObjects(pickMeshes, false, hits)
    raycaster.intersectObject(planet, false, planetHits)
    // Distance is only for E and the hint. A tap opens whatever the ray
    // actually sees, including a prop the prince has not walked up to.
    if (hits.length > 0 && !planetBlocks(hits[0].distance)) {
      const resolve = resolvers.get(hits[0].object)
      if (resolve) return resolve(hits[0].point)
    }
    return screenFallback(clientX, clientY)
  }

  const activate = (item: Item, via: string) => {
    discovered.add(item.id)
    lastTriggerId = item.id
    lastTriggerPointer = via
    if (item.sunset && !sunset.start()) {
      dialogue.open(lines.chairWait)
      return
    }
    dialogue.open(item.lines)
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.code === 'Space') event.preventDefault()
    if (event.repeat) return
    if (event.code !== 'KeyE' && event.code !== 'Space') return
    if (!dialogue.isOpen) {
      if (event.code !== 'KeyE') return
      const item = closest()
      if (!item) return
      event.preventDefault()
      activate(item, 'keyboard')
      return
    }
    event.preventDefault()
    lastAdvancePointer = 'keyboard'
    dialogue.advance()
  }

  const stopCanvasTaps = trackTaps(view.renderer.domElement, (tap) => {
    if (dialogue.isOpen) return
    const item = pick(tap.clientX, tap.clientY)
    if (!item) return
    activate(item, tap.pointerType)
  })
  window.addEventListener('keydown', onKey)

  const updateHint = () => {
    if (dialogue.isOpen) {
      hint.hide()
      return
    }
    const item = closest()
    if (!item || !projectLift(item.center, item.up, item.hintLift, view.camera)) {
      hint.hide()
      return
    }
    hint.show(pixelX, pixelY, item.id)
  }

  return {
    get blocksMovement() {
      return dialogue.isOpen
    },
    get shadowDynamic() {
      return sunset.playing
    },
    discoverable: items.length,
    discoveredIds(): readonly string[] {
      return [...discovered]
    },
    sunsetViews(): number {
      return sunsetViews
    },
    restoreProgress(ids: readonly string[], views: number): void {
      discovered.clear()
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]
        if (id && byId.has(id)) discovered.add(id)
      }
      sunsetViews = Number.isFinite(views) && views > 0 ? Math.floor(views) : 0
      sunsetLatched = sunset.playing
    },
    resetProgress(): void {
      discovered.clear()
      sunsetViews = 0
      sunsetLatched = false
      dialogue.close()
      sunset.reset()
    },
    suspend(): void {
      hint.hide()
    },
    update(dt: number): void {
      dialogue.update(dt)
      sunset.update(dt)
      const playing = sunset.playing
      if (playing && !sunsetLatched) sunsetViews += 1
      sunsetLatched = playing
      updateHint()
    },
    dispose(): void {
      stopCanvasTaps()
      window.removeEventListener('keydown', onKey)
      dialogue.dispose()
      hint.dispose()
    },
    debug: import.meta.env.DEV ? makeDebug() : undefined,
  }

  function makeDebug(): InteractionDebug {
    return {
      ids(): string[] {
        return items.map((item) => item.id)
      },
      stand(id: string): StandPoint | null {
        const item = byId.get(id)
        if (!item) return null
        const up = item.center.clone().normalize()
        const away = new Vector3()
        for (let i = 0; i < items.length; i++) {
          const other = items[i]
          if (other === item) continue
          const offset = item.center.clone().sub(other.center)
          const dist = offset.length()
          if (dist > 1e-4 && dist < 4.5) away.addScaledVector(offset, 1 / (dist * dist))
        }
        away.addScaledVector(up, -away.dot(up))
        if (away.lengthSq() < 1e-6) {
          away.set(0, 1, 0).cross(up)
          if (away.lengthSq() < 1e-6) away.set(1, 0, 0).cross(up)
        }
        away.normalize()
        const standDist = item.bodyRadius + CHARACTER_RADIUS + 0.38
        const dir = item.center.clone().addScaledVector(away, standDist).normalize()
        const forward = item.center.clone().sub(dir)
        return {
          dx: dir.x,
          dy: dir.y,
          dz: dir.z,
          fx: forward.x,
          fy: forward.y,
          fz: forward.z,
        }
      },
      project(id: string): { x: number; y: number } | null {
        const item = byId.get(id)
        if (!item) return null
        if (!projectLift(item.center, item.up, item.aimLift, view.camera)) return null
        return { x: pixelX, y: pixelY }
      },
      pick(clientX: number, clientY: number): string | null {
        return pick(clientX, clientY)?.id ?? null
      },
      state(): InteractionState {
        const snap = dialogue.snapshot()
        const near = closest()
        const chairPos = props.chair.mesh.position
        return {
          dialogueOpen: snap.open,
          page: snap.page,
          pages: snap.pages,
          text: snap.text,
          full: snap.full,
          typing: snap.typing,
          sunset: sunset.blend,
          sunsetPlaying: sunset.playing,
          chair: { x: chairPos.x, y: chairPos.y, z: chairPos.z },
          near: near?.id ?? null,
          lastTriggerId,
          lastTriggerPointer,
          lastAdvancePointer,
        }
      },
      previewSunset(amount: number): void {
        sunset.preview(amount)
      },
      restoreSunset(): void {
        sunset.restore()
      },
    }
  }
}

function makeItem(
  anchor: { id: string; center: Vector3; up: Vector3; collider: { radius: number } },
  script: readonly string[],
  aimLift: number,
  hintLift: number,
  sunset: boolean,
): Item {
  return {
    id: anchor.id,
    lines: script,
    center: anchor.center,
    up: anchor.up,
    bodyRadius: anchor.collider.radius,
    reach: anchor.collider.radius + CHARACTER_RADIUS + REACH_MARGIN,
    aimLift,
    hintLift,
    sunset,
  }
}

function scriptFor(volcano: VolcanoAnchor, index: number): readonly string[] {
  if (!volcano.active) return lines.volcanoAsleep
  return index === 0 ? lines.volcanoAwake : lines.volcanoSlow
}

function nearestVolcano(volcanoes: readonly Item[], point: Vector3): Item {
  const first = volcanoes[0]
  if (!first) throw new Error('No volcanoes')
  let best = first
  let bestD = Infinity
  for (let i = 0; i < volcanoes.length; i++) {
    const dist = point.distanceToSquared(volcanoes[i].center)
    if (dist < bestD) {
      best = volcanoes[i]
      bestD = dist
    }
  }
  return best
}

function mustGet(byId: Map<string, Item>, id: string): Item {
  const item = byId.get(id)
  if (!item) throw new Error(`Missing interactable ${id}`)
  return item
}
