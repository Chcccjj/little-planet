/**
 * Touch checks for the picture-book interactions.
 * Not an app dependency. Run against the dev server:
 *
 *   npm install --prefix /tmp/pw playwright
 *   npx --prefix /tmp/pw playwright install chromium
 *   PLANET_URL=http://127.0.0.1:43123 node scripts/touch-probe.mjs
 */
import { createRequire } from 'node:module'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'

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
const shots = '/tmp/planet-shots'
const artifacts = process.env.ARTIFACTS ?? '/opt/cursor/artifacts'
mkdirSync(shots, { recursive: true })

const results = {
  url,
  consoleErrors: [],
  pageErrors: [],
  warnings: [],
  touch: {},
  desktop: {},
  perf: {},
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
  mkdirSync(artifacts, { recursive: true })
  const published = [
    'hint_rose.png',
    'hint_volcano.png',
    'hint_volcano_dormant.png',
    'hint_baobab.png',
    'hint_chair.png',
    'dialogue_desktop.png',
    'dialogue_portrait.png',
    'sunset.png',
  ]
  for (const name of published) {
    copyFileSync(`${shots}/${name}`, `${artifacts}/${name}`)
  }
  writeFileSync(`${artifacts}/touch_probe_results.json`, JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
} catch (error) {
  writeFileSync('/tmp/planet-touch-failure.json', JSON.stringify({
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
  const page = await context.newPage()
  const errors = collect(page, 'touch')
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__littlePlanet, null, { timeout: 15000 })
  await page.waitForTimeout(600)
  errors.assertClean('after load')

  await page.touchscreen.tap(195, 80)
  await page.waitForTimeout(200)
  const sky = await state(page)
  if (sky.dialogueOpen) throw new Error(`sky tap opened dialogue: ${JSON.stringify(sky)}`)
  results.touch.skyTapIgnored = true

  const rose = await focus(page, 'rose')
  const roseBefore = await state(page)
  if (roseBefore.dialogueOpen) throw new Error('dialogue open before rose drag')
  await touchDrag(page, rose.x, rose.y, rose.x + 90, rose.y + 24)
  await page.waitForTimeout(250)
  const dragged = await state(page)
  if (dragged.dialogueOpen || dragged.lastTriggerId) {
    throw new Error(`drag triggered an interaction: ${JSON.stringify(dragged)}`)
  }
  results.touch.dragIgnored = { from: rose, lastTriggerId: dragged.lastTriggerId }

  await page.touchscreen.tap(rose.x, rose.y)
  await page.waitForFunction(() => window.__littlePlanet.state().dialogueOpen, null, { timeout: 2000 })
  const opened = await state(page)
  if (opened.lastTriggerId !== 'rose') throw new Error(`rose tap triggered ${opened.lastTriggerId}`)
  if (opened.lastTriggerPointer !== 'touch') {
    throw new Error(`rose tap pointerType was ${opened.lastTriggerPointer}`)
  }
  if (!opened.full.includes('玫瑰')) throw new Error(`unexpected rose line: ${opened.full}`)
  results.touch.roseTap = {
    pointer: opened.lastTriggerPointer,
    id: opened.lastTriggerId,
    full: opened.full,
    point: rose,
  }

  await page.waitForFunction(() => !window.__littlePlanet.state().typing, null, { timeout: 4000 })
  const page0 = await state(page)
  if (page0.typing || page0.page !== 0) throw new Error(`expected a finished first page: ${JSON.stringify(page0)}`)
  if (page0.text !== page0.full) throw new Error('typewriter did not finish the sentence')
  const card = await page.locator('.dialogue-card').boundingBox()
  if (!card) throw new Error('dialogue card missing')
  const layout = {
    x: card.x,
    y: card.y,
    width: card.width,
    height: card.height,
    withinViewport: card.x >= 8 && card.y >= 8 && card.x + card.width <= 382 && card.y + card.height <= 836,
    wideEnough: card.width >= 280,
  }
  if (!layout.withinViewport || !layout.wideEnough) {
    throw new Error(`portrait dialogue layout failed: ${JSON.stringify(layout)}`)
  }
  await page.screenshot({ path: `${shots}/dialogue_portrait.png` })
  await page.touchscreen.tap(card.x + card.width / 2, card.y + card.height * 0.45)
  await page.waitForTimeout(150)
  const page1 = await state(page)
  if (page1.lastAdvancePointer !== 'touch') {
    throw new Error(`dialogue advance pointer was ${page1.lastAdvancePointer}`)
  }
  if (page1.page !== 1) throw new Error(`dialogue did not turn the page: ${JSON.stringify(page1)}`)
  if (page1.full === page0.full) throw new Error('second page repeated the first sentence')
  results.touch.dialoguePage = {
    pointer: page1.lastAdvancePointer,
    from: page0.full,
    to: page1.full,
    layout,
  }
  errors.assertClean('after dialogue')
  await closeDialogue(page, true)

  for (const id of ['volcano-0', 'volcano-2', 'baobab']) {
    const point = await focus(page, id)
    await page.touchscreen.tap(point.x, point.y)
    await page.waitForFunction(() => window.__littlePlanet.state().dialogueOpen, null, { timeout: 2000 })
    const next = await state(page)
    if (next.lastTriggerId !== id) throw new Error(`${id} tap triggered ${next.lastTriggerId}`)
    if (next.lastTriggerPointer !== 'touch') throw new Error(`${id} pointer ${next.lastTriggerPointer}`)
    results.touch[id] = { pointer: next.lastTriggerPointer, full: next.full, point }
    await closeDialogue(page, true)
  }

  const chairPoint = await focus(page, 'chair')
  const chairStart = await state(page)
  await page.touchscreen.tap(chairPoint.x, chairPoint.y)
  await page.waitForFunction(() => window.__littlePlanet.state().dialogueOpen, null, { timeout: 2000 })
  const chairHit = await state(page)
  if (chairHit.lastTriggerId !== 'chair' || chairHit.lastTriggerPointer !== 'touch') {
    throw new Error(`chair tap failed: ${JSON.stringify(chairHit)}`)
  }
  if (!chairHit.full.includes('四十四')) throw new Error(`chair line missing the sunset: ${chairHit.full}`)
  await page.waitForFunction((start) => {
    const now = window.__littlePlanet.state()
    const moved = Math.hypot(now.chair.x - start.x, now.chair.y - start.y, now.chair.z - start.z)
    return now.sunset > 0.45 && moved > 0.12
  }, chairStart.chair, { timeout: 6000 })
  const dusk = await state(page)
  const firstMove = Math.hypot(
    dusk.chair.x - chairStart.chair.x,
    dusk.chair.y - chairStart.chair.y,
    dusk.chair.z - chairStart.chair.z,
  )
  results.touch.chair = {
    pointer: chairHit.lastTriggerPointer,
    advanceWouldBe: chairHit.lastAdvancePointer,
    blend: dusk.sunset,
    playing: dusk.sunsetPlaying,
    moved: firstMove,
    line: chairHit.full,
    point: chairPoint,
  }
  await closeDialogue(page, true)
  await page.waitForFunction(() => !window.__littlePlanet.state().sunsetPlaying, null, { timeout: 14000 })
  const rested = await state(page)
  if (rested.sunset > 0.02) throw new Error(`sunset did not return: ${rested.sunset}`)
  const again = await project(page, 'chair')
  await page.touchscreen.tap(again.x, again.y)
  await page.waitForFunction(() => window.__littlePlanet.state().sunset > 0.3, null, { timeout: 4000 })
  const replay = await state(page)
  const secondMove = Math.hypot(replay.chair.x - dusk.chair.x, replay.chair.y - dusk.chair.y, replay.chair.z - dusk.chair.z)
  if (replay.lastTriggerPointer !== 'touch') throw new Error(`replay pointer ${replay.lastTriggerPointer}`)
  if (secondMove < 0.08) throw new Error(`chair did not move again: ${secondMove}`)
  results.touch.chairReplay = { blend: replay.sunset, moved: secondMove, pointer: replay.lastTriggerPointer }
  errors.assertClean('after chair replay')
  await context.close()
}

async function runDesktop() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    hasTouch: false,
    isMobile: false,
    deviceScaleFactor: 1,
  })
  const page = await context.newPage()
  const errors = collect(page, 'desktop')
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__littlePlanet, null, { timeout: 15000 })
  await page.waitForTimeout(900)
  results.perf.spawn = await samplePerf(page, 1200)

  const hints = [
    ['rose', 'hint_rose.png'],
    ['volcano-0', 'hint_volcano.png'],
    ['volcano-2', 'hint_volcano_dormant.png'],
    ['baobab', 'hint_baobab.png'],
    ['chair', 'hint_chair.png'],
  ]
  for (const [id, file] of hints) {
    await focus(page, id)
    await page.waitForFunction((target) => {
      const hint = document.querySelector('.interact-hint')
      return !!hint && !hint.hidden && hint.dataset.target === target
    }, id, { timeout: 2000 })
    await page.screenshot({ path: `${shots}/${file}` })
  }

  await focus(page, 'baobab')
  await page.keyboard.press('KeyE')
  await page.waitForFunction(() => window.__littlePlanet.state().dialogueOpen, null, { timeout: 2000 })
  const keyed = await state(page)
  if (keyed.lastTriggerPointer !== 'keyboard' || keyed.lastTriggerId !== 'baobab') {
    throw new Error(`E key failed: ${JSON.stringify(keyed)}`)
  }
  results.desktop.baobabKey = { pointer: keyed.lastTriggerPointer, full: keyed.full }
  await closeDialogue(page, false)

  const rose = await focus(page, 'rose')
  await page.mouse.click(rose.x, rose.y)
  await page.waitForFunction(() => window.__littlePlanet.state().dialogueOpen, null, { timeout: 2000 })
  await page.waitForFunction(() => !window.__littlePlanet.state().typing, null, { timeout: 4000 })
  const spoken = await state(page)
  if (spoken.lastTriggerPointer !== 'mouse') throw new Error(`mouse pointer was ${spoken.lastTriggerPointer}`)
  const deskCard = await page.locator('.dialogue-card').boundingBox()
  if (!deskCard) throw new Error('desktop dialogue missing')
  if (deskCard.width > 460 || deskCard.x < 0 || deskCard.y + deskCard.height > 800) {
    throw new Error(`desktop card overflow: ${JSON.stringify(deskCard)}`)
  }
  await page.screenshot({ path: `${shots}/dialogue_desktop.png` })
  results.desktop.roseClick = {
    pointer: spoken.lastTriggerPointer,
    full: spoken.full,
    card: deskCard,
  }
  await closeDialogue(page, false)

  const chair = await focus(page, 'chair', 64, -12)
  const origin = await state(page)
  await page.mouse.click(chair.x, chair.y)
  await page.waitForFunction(() => window.__littlePlanet.state().sunsetPlaying, null, { timeout: 2000 })
  await closeDialogue(page, false)
  await page.waitForFunction(() => window.__littlePlanet.state().sunset > 0.82, null, { timeout: 5000 })
  const mid = await state(page)
  const moved = Math.hypot(mid.chair.x - origin.chair.x, mid.chair.y - origin.chair.y, mid.chair.z - origin.chair.z)
  if (moved < 0.12) throw new Error(`desktop chair did not move: ${moved}`)
  await page.screenshot({ path: `${shots}/sunset.png` })
  results.desktop.sunset = { blend: mid.sunset, playing: mid.sunsetPlaying, moved, pointer: 'mouse' }
  results.perf.sunset = await samplePerf(page, 1000)

  await page.keyboard.down('KeyW')
  results.perf.walking = await samplePerf(page, 1000)
  await page.keyboard.up('KeyW')

  results.perf.maxDrawCalls = await page.evaluate(() => window.__littlePlanet.maxDrawCalls())
  results.perf.panel = await page.locator('.perf-panel').innerText()
  errors.assertClean('desktop end')
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
      if (bucket.length > 0) {
        throw new Error(`console errors ${when}:\n${bucket.join('\n')}`)
      }
    },
  }
}

async function focus(page, id, yaw, pitch) {
  const point = await page.evaluate(({ id, yaw, pitch }) => {
    if (yaw === undefined) return window.__littlePlanet.focus(id)
    return window.__littlePlanet.focus(id, yaw, pitch)
  }, { id, yaw, pitch })
  if (!point) throw new Error(`focus(${id}) returned null`)
  await page.waitForTimeout(180)
  const settled = await project(page, id)
  const near = await page.evaluate(() => window.__littlePlanet.state().near)
  if (near !== id) throw new Error(`stood near ${near}, wanted ${id}`)
  if (settled.x < 4 || settled.y < 4 || settled.x > page.viewportSize().width - 4 || settled.y > page.viewportSize().height - 4) {
    throw new Error(`${id} projects offscreen: ${JSON.stringify(settled)}`)
  }
  return settled
}

async function project(page, id) {
  const point = await page.evaluate((target) => window.__littlePlanet.project(target), id)
  if (!point) throw new Error(`project(${id}) is behind the camera`)
  return point
}

async function state(page) {
  return page.evaluate(() => window.__littlePlanet.state())
}

async function closeDialogue(page, touch) {
  for (let i = 0; i < 8; i++) {
    const open = await page.evaluate(() => window.__littlePlanet.state().dialogueOpen)
    if (!open) return
    if (touch) {
      const box = await page.locator('.dialogue-card').boundingBox()
      if (!box) throw new Error('cannot close, card missing')
      await page.touchscreen.tap(box.x + box.width / 2, box.y + 28)
    } else {
      await page.keyboard.press('Space')
    }
    await page.waitForTimeout(40)
  }
  const stuck = await state(page)
  throw new Error(`dialogue stayed open: ${JSON.stringify(stuck)}`)
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
  const maxCalls = samples.reduce((max, sample) => Math.max(max, sample.calls), 0)
  const fps = samples.map((sample) => sample.fps)
  return {
    samples: samples.length,
    maxCalls,
    minFps: fps.length ? Math.min(...fps) : null,
    maxFps: fps.length ? Math.max(...fps) : null,
    last: samples.at(-1)?.text ?? null,
  }
}
