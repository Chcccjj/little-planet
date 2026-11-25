import type { Vector3 } from 'three'
import { FollowCamera } from './camera/followCamera'
import { CHARACTER_RADIUS, createCharacter } from './character/createCharacter'
import { Locomotion } from './character/locomotion'
import { startLoop } from './core/loop'
import { installProbe } from './debug/probe'
import { createPerfPanel } from './debug/perfPanel'
import { createInteractions } from './interactions'
import { createFrameInput, createInput } from './input'
import { createScene, resizeScene, type SceneContext } from './scene/createScene'
import { isWebGLAvailable, showWebGLFallback } from './scene/webglFallback'
import type { SphereCollider } from './world/collision'
import { createPlanet } from './world/planet'
import { createProps } from './world/props'
import { SurfaceProbe } from './world/surfaceProbe'

const container = document.querySelector<HTMLElement>('#app')
if (!container) throw new Error('Missing #app')

if (!isWebGLAvailable()) {
  showWebGLFallback(container)
} else {
  boot(container)
}

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

  const onResize = () => {
    resizeScene(view)
  }
  window.addEventListener('resize', onResize)
  onResize()

  follow.align(locomotion.up, locomotion.forward)
  follow.update(0, 0, 0, 0, locomotion.position, locomotion.up)

  if (import.meta.env.DEV) {
    installProbe({ locomotion, follow, view, interactions })
  }

  startLoop((dt) => {
    input.read(frame)
    // Dialogue freezes walking. Look and zoom still belong to the input module.
    if (interactions.blocksMovement) {
      frame.moveX = 0
      frame.moveY = 0
    }
    locomotion.update(dt, frame.moveX, frame.moveY, view.camera)
    follow.transport(locomotion.transport)
    follow.update(dt, frame.lookX, frame.lookY, frame.zoom, locomotion.position, locomotion.up)
    props.update(dt)
    interactions.update(dt)
    view.renderer.render(view.scene, view.camera)
    perf.update()
  })
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
