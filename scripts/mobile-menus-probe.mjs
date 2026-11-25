/**
 * Touch, menu, save, and WebGL checks for the mobile-menus branch.
 * Not an app dependency. Run against the dev server:
 *
 *   npm install --prefix /tmp/pw playwright
 *   npx --prefix /tmp/pw playwright install chromium
 *   PLANET_URL=http://127.0.0.1:43123 node scripts/mobile-menus-probe.mjs
 */
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function loadPlaywright() {
  const roots = [process.env.PLAYWRIGHT_PATH, '/tmp/pw/node_modules'].filter(Boolean)
  for (const root of roots) {
    const pkg = `${root}/playwright/package.json`
    if (!existsSync(pkg)) continue
    return createRequire(pkg)('playwright')
  }
  throw new Error('Install playwright outside the app: npm install --prefix /tmp/pw playwright')
}

const { chromium } = loadPlaywright()

const url = process.env.PLANET_URL ?? 'http://127.0.0.1:43123/'
const artifacts = process.env.ARTIFACTS ?? '/opt/cursor/artifacts'
mkdirSync(artifacts, { recursive: true })

const results = {
  url,
  base: process.env.PLANET_BASE ?? null,
  consoleErrors: [],
  pageErrors: [],
  warnings: [],
  touch: {},
  desktop: {},
  webgl: {},
  save: {},
  perf: {},
  bundle: null,
}

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader',
  ],
})

try {
  await runTouch()
  await runDesktop()
  await runCorruptSave()
  await runBlockedStorage()
  await runWebGL()
  await runContextLost()
  if (process.env.DIST) results.bundle = bundleSize(process.env.DIST)
  writeFileSync(join(artifacts, 'mobile_menus_results.json'), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
} catch (error) {
  writeFileSync(join(artifacts, 'mobile_menus_failure.json'), JSON.stringify({
    message: error instanceof Error ? error.stack : String(error),
    results,
  }, null, 2))
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
}

async function runTouch() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  })
  await context.addInitScript(() => {
    if (sessionStorage.getItem('keep-save') !== '1') localStorage.clear()
  })
  const page = await context.newPage()
  const errors = collect(page, 'touch')
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__littlePlanet, null, { timeout: 15000 })
  await page.waitForTimeout(400)
  errors.assertClean('after load')

  const title = await page.locator('[data-screen="title"]').isVisible()
  const playText = await page.locator('[data-action="play"]').innerText()
  const joystickOnTitle = await page.locator('[data-joystick]').isVisible()
  if (!title) throw new Error('portrait title screen is hidden')
  if (playText !== '开始') throw new Error(`expected 开始, saw ${playText}`)
  if (joystickOnTitle) throw new Error('joystick is visible on the title screen')
  await shot(page, 'start-portrait.png')
  results.touch.title = { playText, joystickOnTitle }

  await page.locator('[data-action="play"]').click()
  await page.waitForFunction(() => window.__littlePlanet.session().mode === 'play')
  await page.waitForTimeout(250)
  const stick = await page.locator('[data-joystick]').boundingBox()
  if (!stick) throw new Error('joystick missing in portrait play')
  await shot(page, 'play-joystick-portrait.png')

  const origin = await pose(page)
  await holdStick(page, stick, 800)
  const walked = await pose(page)
  const walkedMeters = dist(origin, walked)
  if (walkedMeters < 0.35) throw new Error(`joystick did not move the prince: ${walkedMeters}`)
  results.touch.joystick = { moved: walkedMeters, from: origin.position, to: walked.position }

  const lookFrom = await pose(page)
  await touchDrag(page, 70, 280, 250, 280)
  const looked = await pose(page)
  const lookMove = dist(lookFrom, looked)
  const lookYaw = angleDelta(lookFrom.orbitYaw, looked.orbitYaw)
  if (lookMove > 0.08) throw new Error(`look drag walked the prince: ${lookMove}`)
  if (lookYaw < 0.35) throw new Error(`look drag did not orbit: ${lookYaw}`)
  results.touch.look = { moved: lookMove, yaw: lookYaw }

  const bothFrom = await pose(page)
  await stickAndLook(page, stick)
  const both = await pose(page)
  const bothMove = dist(bothFrom, both)
  const bothYaw = angleDelta(bothFrom.orbitYaw, both.orbitYaw)
  if (bothMove < 0.25) throw new Error(`simultaneous stick did not walk: ${bothMove}`)
  if (bothYaw < 0.35) throw new Error(`simultaneous look did not orbit: ${bothYaw}`)
  results.touch.simultaneous = { moved: bothMove, yaw: bothYaw }

  const beforePinch = await lensDistance(page)
  await pinch(page, 36, 120)
  await page.waitForTimeout(350)
  const afterPinch = await lensDistance(page)
  if (beforePinch - afterPinch < 0.35) {
    throw new Error(`pinch did not pull the camera in: ${beforePinch} -> ${afterPinch}`)
  }
  results.touch.pinch = { before: beforePinch, after: afterPinch }

  const stickOnly = await page.evaluate(() => window.__littlePlanet.state())
  if (stickOnly.dialogueOpen || stickOnly.lastTriggerId) {
    throw new Error(`joystick opened a dialogue: ${JSON.stringify(stickOnly)}`)
  }
  results.touch.stickDragIgnored = true

  const approached = await walkUpAndTap(page, stick)
  await page.locator('[data-joystick]').waitFor({ state: 'hidden', timeout: 2000 })
  await closeDialogue(page)
  await page.locator('[data-joystick]').waitFor({ state: 'visible', timeout: 2000 })
  const parked = await pose(page)
  await page.waitForTimeout(450)
  const residual = dist(parked, await pose(page))
  if (residual > 0.08) throw new Error(`dialogue left the prince walking: ${residual}`)
  const resumedFrom = await pose(page)
  await holdStick(page, stick, 550)
  const resumedMove = dist(resumedFrom, await pose(page))
  if (resumedMove < 0.25) throw new Error(`joystick could not walk after dialogue: ${resumedMove}`)
  results.touch.dialogueStick = { approached, residual, resumedMove }

  const rose = await focus(page, 'rose')
  await touchDrag(page, rose.x - 10, rose.y, rose.x + 70, rose.y + 12)
  await page.waitForTimeout(200)
  const dragged = await page.evaluate(() => window.__littlePlanet.state())
  if (dragged.dialogueOpen || dragged.lastTriggerId) {
    throw new Error(`drag opened an interaction: ${JSON.stringify(dragged)}`)
  }
  const roseTap = await focus(page, 'rose')
  await page.touchscreen.tap(roseTap.x, roseTap.y)
  await page.waitForFunction(() => window.__littlePlanet.state().dialogueOpen, null, { timeout: 2000 })
  const opened = await page.evaluate(() => window.__littlePlanet.state())
  if (opened.lastTriggerId !== 'rose' || opened.lastTriggerPointer !== 'touch') {
    throw new Error(`rose tap failed: ${JSON.stringify(opened)}`)
  }
  const foundRose = await page.evaluate(() => window.__littlePlanet.session().discovered.includes('rose'))
  if (!foundRose) throw new Error('rose tap was not recorded')
  results.touch.roseTap = { id: opened.lastTriggerId, pointer: opened.lastTriggerPointer, point: roseTap }
  await closeDialogue(page)

  const chair = await focus(page, 'chair')
  await page.touchscreen.tap(chair.x, chair.y)
  await page.waitForFunction(() => window.__littlePlanet.state().sunset > 0.08, null, { timeout: 4000 })
  await page.waitForFunction(() => window.__littlePlanet.session().sunsetViews >= 1, null, { timeout: 2000 })
  const rising = await page.evaluate(() => window.__littlePlanet.state().sunset)
  await page.locator('[data-action="pause"]').click()
  await page.waitForFunction(() => window.__littlePlanet.session().mode === 'paused')
  await page.waitForTimeout(700)
  const held = await page.evaluate(() => window.__littlePlanet.state().sunset)
  if (Math.abs(held - rising) > 0.03) throw new Error(`sunset advanced while paused: ${rising} -> ${held}`)
  await shot(page, 'pause-portrait.png')
  await page.locator('[data-action="resume"]').click()
  await page.waitForFunction(() => window.__littlePlanet.session().mode === 'play')
  await page.waitForTimeout(600)
  const later = await page.evaluate(() => window.__littlePlanet.state().sunset)
  if (later < held + 0.04) throw new Error(`sunset did not resume: ${held} -> ${later}`)
  results.touch.pause = { rising, held, later }

  await page.locator('[data-action="pause"]').click()
  await page.waitForFunction(() => window.__littlePlanet.session().mode === 'paused')
  const checkpoint = await pose(page)
  const progress = await page.evaluate(() => window.__littlePlanet.session())
  const raw = await page.evaluate(() => localStorage.getItem('little-planet.save.v1'))
  const saved = JSON.parse(raw)
  if (!saved.discovered.includes('rose') || !saved.discovered.includes('chair')) {
    throw new Error(`save missing interactions: ${raw}`)
  }
  if (saved.sunsetViews < 1) throw new Error(`save missing sunset count: ${raw}`)
  results.touch.checkpoint = { position: checkpoint.position, progress, save: saved }

  await page.evaluate(() => sessionStorage.setItem('keep-save', '1'))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__littlePlanet, null, { timeout: 15000 })
  const continued = await page.locator('[data-action="play"]').innerText()
  const restart = await page.locator('[data-action="restart"]').count()
  const progressText = await page.locator('[data-progress]').innerText()
  if (continued !== '继续') throw new Error(`reload did not offer 继续: ${continued}`)
  if (restart !== 1) throw new Error('reload missing 重新开始')
  if (!progressText.includes('已发现') || !progressText.includes('/6')) {
    throw new Error(`progress text missing: ${progressText}`)
  }
  await page.locator('[data-action="play"]').click()
  await page.waitForFunction(() => window.__littlePlanet.session().mode === 'play')
  await page.waitForTimeout(200)
  const restored = await pose(page)
  const restoredSession = await page.evaluate(() => window.__littlePlanet.session())
  const restoredMeters = dist(checkpoint, restored)
  if (restoredMeters > 0.05) throw new Error(`position was not restored: ${restoredMeters}`)
  if (!restoredSession.discovered.includes('rose') || !restoredSession.discovered.includes('chair')) {
    throw new Error(`discovered was not restored: ${JSON.stringify(restoredSession.discovered)}`)
  }
  if (restoredSession.sunsetViews < 1) throw new Error('sunset count was not restored')
  results.touch.restored = {
    meters: restoredMeters,
    progressText,
    discovered: restoredSession.discovered,
    sunsetViews: restoredSession.sunsetViews,
  }

  results.perf.portrait = await samplePerf(page, 1000)
  errors.assertClean('touch end')
  await context.close()
}

async function runDesktop() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    hasTouch: false,
    isMobile: false,
    deviceScaleFactor: 1,
  })
  await context.addInitScript(() => localStorage.clear())
  const page = await context.newPage()
  const errors = collect(page, 'desktop')
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__littlePlanet, null, { timeout: 15000 })
  await page.waitForTimeout(500)
  if (await page.locator('[data-joystick]').count()) throw new Error('desktop shows a joystick')
  if ((await page.locator('[data-action="play"]').innerText()) !== '开始') throw new Error('desktop title is not 开始')
  await shot(page, 'start-desktop.png')
  await page.locator('[data-action="play"]').click()
  await page.waitForFunction(() => window.__littlePlanet.session().mode === 'play')
  await page.waitForTimeout(300)

  const before = await pose(page)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(500)
  await page.keyboard.up('KeyW')
  const after = await pose(page)
  const walked = dist(before, after)
  if (walked < 0.3) throw new Error(`WASD did not walk: ${walked}`)
  results.desktop.wasd = { moved: walked }

  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__littlePlanet.session().mode === 'paused')
  if (!(await page.locator('[data-screen="pause"]').isVisible())) throw new Error('Esc did not show the pause menu')
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__littlePlanet.session().mode === 'play')
  if (await page.locator('[data-screen="pause"]').isVisible()) throw new Error('Esc did not resume')

  await page.locator('[data-action="pause"]').click()
  await page.waitForFunction(() => window.__littlePlanet.session().mode === 'paused')
  const sound = page.locator('[data-action="sound"]')
  if ((await sound.getAttribute('aria-checked')) !== 'true') throw new Error('sound default is not on')
  await sound.click()
  if ((await sound.getAttribute('aria-checked')) !== 'false') throw new Error('sound toggle did not flip')
  await page.locator('[data-action="title"]').click()
  await page.waitForFunction(() => window.__littlePlanet.session().mode === 'title')
  if ((await page.locator('[data-action="play"]').innerText()) !== '继续') throw new Error('return to title lost the save')
  await page.locator('[data-action="play"]').click()
  await page.waitForFunction(() => window.__littlePlanet.session().mode === 'play')
  await page.locator('[data-action="pause"]').click()
  await page.waitForFunction(() => window.__littlePlanet.session().mode === 'paused')
  if ((await page.locator('[data-action="sound"]').getAttribute('aria-checked')) !== 'false') {
    throw new Error('sound preference was not saved')
  }
  await page.locator('[data-action="resume"]').click()

  results.perf.desktop = await samplePerf(page, 1000)
  results.perf.maxDrawCalls = await page.evaluate(() => window.__littlePlanet.maxDrawCalls())
  results.perf.panel = await page.locator('.perf-panel').innerText()
  errors.assertClean('desktop end')
  await context.close()
}

async function runCorruptSave() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  })
  await context.addInitScript(() => {
    localStorage.setItem('little-planet.save.v1', '{')
  })
  const page = await context.newPage()
  const errors = collect(page, 'corrupt-save')
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__littlePlanet, null, { timeout: 15000 })
  const label = await page.locator('[data-action="play"]').innerText()
  if (label !== '开始') throw new Error(`broken save still offered ${label}`)
  if (await page.locator('[data-action="restart"]').count()) throw new Error('broken save showed 重新开始')
  results.save.corrupt = { label }
  errors.assertClean('corrupt save')
  await context.close()
}

async function runBlockedStorage() {
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
    deviceScaleFactor: 1,
  })
  await context.addInitScript(() => {
    const fail = () => {
      throw new Error('storage blocked')
    }
    Storage.prototype.getItem = fail
    Storage.prototype.setItem = fail
    Storage.prototype.removeItem = fail
  })
  const page = await context.newPage()
  const errors = collect(page, 'blocked-storage')
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__littlePlanet, null, { timeout: 15000 })
  if ((await page.locator('[data-action="play"]').innerText()) !== '开始') {
    throw new Error('blocked storage did not fall back to a new game')
  }
  await page.locator('[data-action="play"]').click()
  await page.waitForFunction(() => window.__littlePlanet.session().mode === 'play')
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => window.__littlePlanet.session().mode === 'paused')
  errors.assertClean('blocked storage')
  results.save.blocked = { paused: true }
  await context.close()
}

async function runWebGL() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  })
  await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function patched(type, attrs) {
      if (String(type).toLowerCase().includes('webgl')) return null
      return original.call(this, type, attrs)
    }
  })
  const page = await context.newPage()
  const errors = collect(page, 'webgl')
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.webgl-fallback', { timeout: 8000 })
  const heading = await page.locator('.webgl-fallback h1').innerText()
  const body = await page.locator('.webgl-fallback p').innerText()
  if (!heading.includes('B612') || !heading.includes('看不见')) {
    throw new Error(`unexpected WebGL heading: ${heading}`)
  }
  if (await page.locator('canvas').count()) throw new Error('WebGL fallback still has a canvas')
  await shot(page, 'webgl-fallback.png')
  results.webgl.missing = { heading, body }
  errors.assertClean('webgl missing')
  await context.close()
}

async function runContextLost() {
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
    deviceScaleFactor: 1,
  })
  await context.addInitScript(() => localStorage.clear())
  const page = await context.newPage()
  const errors = collect(page, 'context-lost')
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__littlePlanet, null, { timeout: 15000 })
  await page.locator('[data-action="play"]').click()
  await page.waitForFunction(() => window.__littlePlanet.session().mode === 'play')
  await page.waitForTimeout(200)
  const lost = await page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas) return 'no-canvas'
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return 'no-gl'
    const ext = gl.getExtension('WEBGL_lose_context')
    if (!ext) return 'no-ext'
    ext.loseContext()
    return 'lost'
  })
  if (lost !== 'lost') throw new Error(`could not lose the WebGL context: ${lost}`)
  await page.waitForSelector('.webgl-fallback', { timeout: 4000 })
  const heading = await page.locator('.webgl-fallback h1').innerText()
  if (!heading.includes('看不见')) throw new Error(`context loss did not show the card: ${heading}`)
  results.webgl.lost = { heading, triggered: lost }
  errors.assertClean('context lost')
  await context.close()
}

function collect(page, label) {
  const bucket = []
  page.on('pageerror', (error) => {
    const message = `${label} pageerror: ${error.message}`
    results.pageErrors.push(message)
    bucket.push(message)
  })
  page.on('console', (msg) => {
    const text = msg.text()
    if (msg.type() === 'error') {
      const message = `${label} console: ${text}`
      results.consoleErrors.push(message)
      bucket.push(message)
    } else if (msg.type() === 'warning') {
      results.warnings.push(`${label}: ${text}`)
    }
  })
  return {
    assertClean(when) {
      if (bucket.length > 0) throw new Error(`console errors ${when}:\n${bucket.join('\n')}`)
    },
  }
}

async function pose(page) {
  return page.evaluate(() => {
    const read = window.__littlePlanet.read()
    const camera = window.__littlePlanet.camera()
    return {
      position: { x: read.x, y: read.y, z: read.z },
      orbitYaw: camera.orbitYaw,
    }
  })
}

function dist(a, b) {
  const dx = a.position.x - b.position.x
  const dy = a.position.y - b.position.y
  const dz = a.position.z - b.position.z
  return Math.hypot(dx, dy, dz)
}

function angleDelta(a, b) {
  const diff = Math.atan2(Math.sin(a - b), Math.cos(a - b))
  return Math.abs(diff)
}

async function focus(page, id) {
  const point = await page.evaluate((target) => window.__littlePlanet.focus(target), id)
  if (!point) throw new Error(`focus(${id}) returned null`)
  await page.waitForTimeout(220)
  const settled = await page.evaluate((target) => window.__littlePlanet.project(target), id)
  if (!settled) throw new Error(`project(${id}) is behind the camera`)
  const near = await page.evaluate(() => window.__littlePlanet.state().near)
  if (near !== id) throw new Error(`stood near ${near}, wanted ${id}`)
  const viewport = page.viewportSize()
  if (settled.x < 8 || settled.y < 8 || settled.x > viewport.width - 8 || settled.y > viewport.height - 8) {
    throw new Error(`${id} projects offscreen: ${JSON.stringify(settled)}`)
  }
  return settled
}

async function closeDialogue(page) {
  for (let i = 0; i < 8; i++) {
    const open = await page.evaluate(() => window.__littlePlanet.state().dialogueOpen)
    if (!open) return
    const box = await page.locator('.dialogue-card').boundingBox()
    if (!box) throw new Error('dialogue card missing')
    await page.touchscreen.tap(box.x + box.width / 2, box.y + 24)
    await page.waitForTimeout(40)
  }
  throw new Error('dialogue stayed open')
}

async function lensDistance(page) {
  return page.evaluate(() => {
    const read = window.__littlePlanet.read()
    const camera = window.__littlePlanet.camera()
    return Math.hypot(camera.x - read.x, camera.y - read.y, camera.z - read.z)
  })
}

async function pinch(page, startGap, endGap) {
  const client = await page.context().newCDPSession(page)
  const x = 210
  const y = 300
  const gapAt = (t) => startGap + (endGap - startGap) * t
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: x - gapAt(0), y, id: 1 },
      { x: x + gapAt(0), y, id: 2 },
    ],
  })
  const steps = 8
  for (let i = 1; i <= steps; i++) {
    const gap = gapAt(i / steps)
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: x - gap, y, id: 1 },
        { x: x + gap, y, id: 2 },
      ],
    })
    await page.waitForTimeout(30)
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await client.detach()
}

async function walkUpAndTap(page, stick) {
  const width = page.viewportSize().width
  for (let i = 0; i < 24; i++) {
    const near = await page.evaluate(() => window.__littlePlanet.state().near)
    const hit = await page.evaluate((target) => {
      if (!target) return null
      const projected = window.__littlePlanet.project(target)
      if (!projected) return null
      for (let dy = -28; dy <= 28; dy += 8) {
        for (let dx = -28; dx <= 28; dx += 8) {
          const x = projected.x + dx
          const y = projected.y + dy
          if (x < 12 || y < 70 || x > window.innerWidth - 12 || y > window.innerHeight - 24) continue
          if (x < 160 && y > window.innerHeight - 170) continue
          if (window.__littlePlanet.pick(x, y) === target) return { id: target, x, y }
        }
      }
      return null
    }, near)
    if (near && hit) {
      await page.touchscreen.tap(hit.x, hit.y)
      await page.waitForFunction(() => window.__littlePlanet.state().dialogueOpen, null, { timeout: 2000 })
      const opened = await page.evaluate(() => window.__littlePlanet.state())
      if (opened.lastTriggerId !== near || opened.lastTriggerPointer !== 'touch') {
        throw new Error(`walk-up tap failed: ${JSON.stringify(opened)}`)
      }
      return { id: near, point: hit, steps: i }
    }
    const aim = await page.evaluate(() => window.__littlePlanet.project('rose') ?? window.__littlePlanet.project('baobab'))
    if (!aim) {
      await touchDrag(page, 150, 250, 230, 250)
    } else {
      const dx = aim.x - width / 2
      if (Math.abs(dx) > 36) {
        const step = Math.max(-70, Math.min(70, dx * 0.45))
        await touchDrag(page, 170, 250, 170 + step, 250)
      }
    }
    await holdStick(page, stick, 280)
  }
  throw new Error('could not walk up to a prop and tap it')
}

async function holdStick(page, stick, ms) {
  const x = stick.x + stick.width / 2
  const y = stick.y + stick.height / 2 - stick.height * 0.28
  const client = await page.context().newCDPSession(page)
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  })
  await page.waitForTimeout(ms)
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await client.detach()
}

async function stickAndLook(page, stick) {
  const x = stick.x + stick.width / 2
  const y = stick.y + stick.height / 2 - stick.height * 0.28
  const client = await page.context().newCDPSession(page)
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x, y, id: 1 },
      { x: 200, y: 240, id: 2 },
    ],
  })
  const steps = 8
  for (let i = 1; i <= steps; i++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x, y, id: 1 },
        { x: 200 + i * 16, y: 240, id: 2 },
      ],
    })
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(500)
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await client.detach()
}

async function touchDrag(page, x0, y0, x1, y1) {
  const client = await page.context().newCDPSession(page)
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: x0, y: y0, id: 1 }],
  })
  const steps = 6
  for (let i = 1; i <= steps; i++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x0 + ((x1 - x0) * i) / steps, y: y0 + ((y1 - y0) * i) / steps, id: 1 }],
    })
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await client.detach()
}

async function shot(page, name) {
  await page.addStyleTag({ content: '.perf-panel{display:none!important}' })
  await page.screenshot({ path: join(artifacts, name) })
}

async function samplePerf(page, ms) {
  const samples = []
  const started = Date.now()
  while (Date.now() - started < ms) {
    await page.waitForTimeout(350)
    const text = await page.locator('.perf-panel').innerText()
    const fps = Number(text.match(/(\d+)\s*fps/)?.[1])
    const calls = Number(text.match(/(\d+)\s*calls/)?.[1])
    if (Number.isFinite(fps) && Number.isFinite(calls)) samples.push({ fps, calls, text })
  }
  const fps = samples.map((sample) => sample.fps)
  const calls = samples.map((sample) => sample.calls)
  return {
    samples: samples.length,
    minFps: fps.length ? Math.min(...fps) : null,
    maxFps: fps.length ? Math.max(...fps) : null,
    maxCalls: calls.length ? Math.max(...calls) : null,
    last: samples.at(-1)?.text ?? null,
  }
}

function bundleSize(dist) {
  const files = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else files.push(path)
    }
  }
  walk(dist)
  let raw = 0
  let gzip = 0
  const rows = files.map((path) => {
    const bytes = readFileSync(path)
    const gz = gzipSync(bytes, { level: 9 }).length
    raw += bytes.length
    gzip += gz
    return { file: path.slice(dist.length + 1), bytes: bytes.length, gzip: gz }
  })
  return { raw, gzip, files: rows }
}
