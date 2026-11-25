import { createScene, resizeScene } from './scene/createScene'
import { createPlanet } from './world/planet'
import { startLoop } from './core/loop'
import { createPerfPanel } from './debug/perfPanel'

const container = document.querySelector<HTMLElement>('#app')
if (!container) throw new Error('Missing #app')

const view = createScene(container)
view.scene.add(createPlanet())

const perf = createPerfPanel(view.renderer)

// Placeholder idle orbit until PR 2 adds spherical walking and a follow camera.
const orbitRadius = 20
const orbitHeight = 6.2
const orbitSpeed = 0.07
let orbitAngle = 0.85

function onResize(): void {
  resizeScene(view)
}

window.addEventListener('resize', onResize)
onResize()

startLoop((dt) => {
  orbitAngle += dt * orbitSpeed
  view.camera.position.set(
    Math.cos(orbitAngle) * orbitRadius,
    orbitHeight,
    Math.sin(orbitAngle) * orbitRadius,
  )
  view.camera.lookAt(0, 0.35, 0)

  view.renderer.render(view.scene, view.camera)
  // Read renderer.info after render; Three clears those counters on the next frame.
  perf.update()
})
