import { Vector3 } from 'three'
import { FollowCamera } from './camera/followCamera'
import { CHARACTER_RADIUS, createCharacter } from './character/createCharacter'
import { Locomotion, SPAWN_DIRECTION } from './character/locomotion'
import { startLoop } from './core/loop'
import { installProbe } from './debug/probe'
import { createPerfPanel } from './debug/perfPanel'
import { createInteractions } from './interactions'
import { createFrameInput, createInput } from './input'
import { clearSave, loadSave, writeSave, type PlanetSave } from './save/storage'
import { createScene, resizeScene, type SceneContext } from './scene/createScene'
import { isWebGLAvailable, showWebGLFallback } from './scene/webglFallback'
import { createShell, type TitleInfo } from './ui/shell'
import type { SphereCollider } from './world/collision'
import { createPlanet } from './world/planet'
import { createProps } from './world/props'
import { SurfaceProbe } from './world/surfaceProbe'

const SAVE_EVERY = 4
const SOUTH = new Vector3(0, -1, 0)

const container = document.querySelector<HTMLElement>('#app')
if (!container) throw new Error('Missing #app')

if (!isWebGLAvailable()) {
  showWebGLFallback(container)
} else {
  boot(container)
}

type Mode = 'title' | 'play' | 'paused'

function boot(container: HTMLElement): void {
  let view: SceneContext
  try {
    view = createScene(container)
  } catch (error) {
    console.error(error)
    showWebGLFallback(container)
    return
  }

  const planet = createPlanet()
  view.scene.add(planet)

  const surface = new SurfaceProbe(planet)
  const props = createProps(surface)
  view.scene.add(props.group)

  const character = createCharacter()
  view.scene.add(character.root)

  const locomotion = new Locomotion(character, surface, props.colliders)
  assertSpawnIsClear(locomotion.position, props.colliders)

  const follow = new FollowCamera(view.camera, surface, props.colliders)
  const interactions = createInteractions(view, props, surface, planet, () => locomotion.position)
  const input = createInput(view.renderer.domElement)
  const frame = createFrameInput()
  const perf = createPerfPanel(view.renderer)

  const savedDir = new Vector3()
  const savedForward = new Vector3()
  let sound = true
  let hasSave = false
  let mode: Mode = 'title'
  let saveClock = 0
  let titleSpin = 0.9
  let running = true

  const stored = loadSave()
  if (stored) {
    hasSave = true
    applySave(stored)
  }

  input.setActive(false)

  const shell = createShell({
    onPlay: () => enterPlay(true),
    onRestart: () => {
      clearSave()
      hasSave = false
      interactions.resetProgress()
      locomotion.relocate(SPAWN_DIRECTION, SOUTH)
      enterPlay(true)
    },
    onResume: () => resume(),
    onTitle: () => showTitle(),
    onPause: () => pause(),
    onSound: (on) => {
      sound = on
      if (mode === 'play' || mode === 'paused') persist(true)
    },
  })
  shell.setSound(sound)
  shell.setTitle(titleInfo())
  shell.setMode('title')

  const onResize = () => {
    resizeScene(view)
  }
  window.addEventListener('resize', onResize)
  onResize()

  const onHide = () => {
    if (document.hidden && mode === 'play') pause()
  }
  const onLeave = () => {
    if (mode === 'play' || mode === 'paused') persist(true)
  }
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('beforeunload', onLeave)

  const loop = startLoop((dt) => {
    if (!running) return
    if (mode === 'paused') return
    if (mode === 'title') {
      renderTitle(dt)
      return
    }
    // Hide the joystick before read, so a deflection from the previous page
    // cannot leak into this frame. Look and zoom still come from the drivers.
    input.setWalking(!interactions.blocksMovement)
    input.read(frame)
    locomotion.update(dt, frame.moveX, frame.moveY, view.camera)
    follow.transport(locomotion.transport)
    follow.update(dt, frame.lookX, frame.lookY, frame.zoom, locomotion.position, locomotion.up)
    props.update(dt)
    interactions.update(dt)
    view.renderer.render(view.scene, view.camera)
    perf.update()
    saveClock += dt
    if (saveClock >= SAVE_EVERY) persist(false)
  })

  const onContextLost = (event: Event) => {
    event.preventDefault()
    if (mode === 'play' || mode === 'paused') persist(true)
    teardown()
    showWebGLFallback(container)
  }
  view.renderer.domElement.addEventListener('webglcontextlost', onContextLost)

  if (import.meta.env.DEV) {
    installProbe({
      locomotion,
      follow,
      view,
      interactions,
      session: () => ({
        mode,
        discovered: [...interactions.discoveredIds()],
        sunsetViews: interactions.sunsetViews(),
        discoverable: interactions.discoverable,
        sound,
      }),
    })
  }

  function titleInfo(): TitleInfo {
    return {
      hasSave,
      discovered: interactions.discoveredIds().length,
      total: interactions.discoverable,
      sunsetViews: interactions.sunsetViews(),
    }
  }

  function capture(): PlanetSave {
    const position = locomotion.position
    const length = Math.max(position.length(), 1e-6)
    return {
      v: 1,
      dx: position.x / length,
      dy: position.y / length,
      dz: position.z / length,
      fx: locomotion.forward.x,
      fy: locomotion.forward.y,
      fz: locomotion.forward.z,
      discovered: [...interactions.discoveredIds()],
      sunsetViews: interactions.sunsetViews(),
      sound,
    }
  }

  function applySave(data: PlanetSave): void {
    savedDir.set(data.dx, data.dy, data.dz)
    savedForward.set(data.fx, data.fy, data.fz)
    locomotion.relocate(savedDir, savedForward)
    interactions.restoreProgress(data.discovered, data.sunsetViews)
    sound = data.sound
  }

  function persist(force: boolean): void {
    if (!force && saveClock < SAVE_EVERY) return
    saveClock = 0
    if (writeSave(capture())) hasSave = true
  }

  function enterPlay(realign: boolean): void {
    mode = 'play'
    input.setActive(true)
    shell.setMode('play')
    if (!realign) return
    follow.align(locomotion.up, locomotion.forward)
    follow.update(1, 0, 0, 0, locomotion.position, locomotion.up)
  }

  function resume(): void {
    if (mode !== 'paused') return
    enterPlay(false)
  }

  function pause(): void {
    if (mode !== 'play') return
    persist(true)
    mode = 'paused'
    input.setActive(false)
    interactions.suspend()
    shell.setMode('paused')
  }

  function showTitle(): void {
    if (mode === 'play' || mode === 'paused') persist(true)
    mode = 'title'
    input.setActive(false)
    interactions.suspend()
    shell.setSound(sound)
    shell.setTitle(titleInfo())
    shell.setMode('title')
  }

  function renderTitle(dt: number): void {
    titleSpin += dt * 0.12
    const aspect = view.camera.aspect
    const dist = aspect < 1 ? 28 : 18
    const height = aspect < 1 ? 8 : 6.4
    view.camera.position.set(Math.cos(titleSpin) * dist, height, Math.sin(titleSpin) * dist)
    view.camera.up.set(0, 1, 0)
    view.camera.lookAt(0, 0.15, 0)
    view.camera.updateMatrixWorld()
    props.update(dt)
    view.renderer.render(view.scene, view.camera)
    perf.update()
  }

  function teardown(): void {
    if (!running) return
    running = false
    loop.stop()
    window.removeEventListener('resize', onResize)
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('beforeunload', onLeave)
    view.renderer.domElement.removeEventListener('webglcontextlost', onContextLost)
    input.dispose()
    interactions.dispose()
    shell.dispose()
    perf.dispose()
  }
}

function assertSpawnIsClear(position: Vector3, colliders: readonly SphereCollider[]): void {
  for (let i = 0; i < colliders.length; i++) {
    const collider = colliders[i]
    const min = collider.radius + CHARACTER_RADIUS + 0.2
    const gap = position.distanceToSquared(collider.center)
    if (gap < min * min) {
      throw new Error(`Spawn overlaps the ${collider.name}`)
    }
  }
}
