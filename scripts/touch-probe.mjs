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

const PROP_IDS = ['rose', 'volcano-0', 'volcano-1', 'volcano-2', 'baobab', 'chair']

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
  await runDrawCalls()
  mkdirSync(artifacts, { recursive: true })
  const published = ['dialogue_spawn_tap.png', 'hint_coarse.png']
  for (const name of published) {
    copyFileSync(`${shots}/${name}`, `${artifacts}/${name}`)
  }
  writeFileSync(`${artifacts}/spawn_tap_results.json`, JSON.stringify(results, null, 2))
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
  await context.addInitScript(() => localStorage.removeItem('little-planet.save.v1'))
  const page = await context.newPage()
  const client = await context.newCDPSession(page)
  await client.send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'pointer', value: 'coarse' },
      { name: 'hover', value: 'none' },
    ],
  })
  const errors = collect(page, 'touch')
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__littlePlanet, null, { timeout: 15000 })
  await beginPlay(page)
  await page.waitForTimeout(300)
  errors.assertClean('after load')

  const coarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)
  results.touch.coarsePointer = coarse
  if (!coarse) throw new Error('phone viewport did not report a coarse pointer')

  const spawnVisible = await onScreen(page)
  results.touch.spawnVisible = spawnVisible.map((item) => item.id)
  const nearAtSpawn = await page.evaluate(() => window.__littlePlanet.state().near)
  results.touch.nearAtSpawn = nearAtSpawn
  await page.keyboard.press('KeyE')
  await page.waitForTimeout(150)
  const afterE = await state(page)
  if (afterE.dialogueOpen) throw new Error(`E opened a dialogue from spawn: ${JSON.stringify(afterE)}`)
  results.touch.eIgnoredAtSpawn = true

  if (spawnVisible.length === 0) throw new Error('nothing to tap on the spawn screen')
  const roseAtSpawn = spawnVisible.find((item) => item.id === 'rose')
  const first = roseAtSpawn ?? spawnVisible[0]
  await touchDrag(client, first.x, first.y, Math.min(370, first.x + 88), first.y + 28)
  await page.waitForTimeout(200)
  const dragged = await state(page)
  if (dragged.dialogueOpen || dragged.lastTriggerId) {
    throw new Error(`drag triggered an interaction: ${JSON.stringify(dragged)}`)
  }
  results.touch.dragIgnored = { id: first.id }

  await tapProp(page, first, first.id)
  await page.waitForFunction(() => !window.__littlePlanet.state().typing, null, { timeout: 4000 })
  const spoken = await state(page)
  if (spoken.text !== spoken.full) throw new Error(`spawn line did not finish: ${JSON.stringify(spoken)}`)
  const card = await page.locator('.dialogue-card').boundingBox()
  if (!card) throw new Error('dialogue card missing')
  results.touch.spawnDialogue = {
    id: first.id,
    pointer: spoken.lastTriggerPointer,
    full: spoken.full,
    card: { x: card.x, y: card.y, width: card.width, height: card.height },
  }
  await page.screenshot({ path: `${shots}/dialogue_spawn_tap.png` })
  await closeDialogue(page, true)

  const opened = new Set([first.id])
  for (const item of spawnVisible) {
    if (opened.has(item.id)) continue
    const fresh = (await onScreen(page)).find((candidate) => candidate.id === item.id) ?? item
    await tapProp(page, fresh, item.id)
    opened.add(item.id)
    results.touch[item.id] = { atSpawn: true, pointer: 'touch', full: (await state(page)).full }
    await closeDialogue(page, true)
  }

  if (!opened.has('rose')) {
    const point = await reveal(page, 'rose')
    await tapProp(page, point, 'rose')
    opened.add('rose')
    results.touch.rose = { atSpawn: false, turnedWithMouse: true, pointer: 'touch', full: (await state(page)).full }
    await closeDialogue(page, true)
  }
  // Default pitch looks along the horizon, so nearby props sit just out of frame.
  // A mouse drag upward raises the camera; touch drag still does not orbit.
  await orbit(page, 0, -170)
  for (const id of ['baobab', 'volcano-0', 'volcano-2']) {
    if (opened.has(id)) continue
    const point = await reveal(page, id)
    await tapProp(page, point, id)
    opened.add(id)
    results.touch[id] = { atSpawn: false, turnedWithMouse: true, pointer: 'touch', full: (await state(page)).full }
    await closeDialogue(page, true)
    break
  }

  if (!opened.has('chair')) {
    const point = await approach(page, 'chair')
    await tapProp(page, point, 'chair')
    opened.add('chair')
    const dist = await page.evaluate(() => {
      const prince = window.__littlePlanet.read()
      const chair = window.__littlePlanet.state().chair
      return Math.hypot(prince.x - chair.x, prince.y - chair.y, prince.z - chair.z)
    })
    results.touch.chair = {
      atSpawn: false,
      walked: true,
      distance: dist,
      pointer: 'touch',
      full: (await state(page)).full,
    }
    await closeDialogue(page, true)
  }
  const chairAgain = await hittable(page, 'chair') ?? await approach(page, 'chair')
  await page.touchscreen.tap(chairAgain.x, chairAgain.y)
  await page.waitForFunction(() => window.__littlePlanet.state().dialogueOpen, null, { timeout: 2000 })
  const waiting = await state(page)
  if (!waiting.full.includes('太阳还没回来')) {
    throw new Error(`cooldown tap did not explain itself: ${JSON.stringify(waiting)}`)
  }
  if (waiting.lastTriggerPointer !== 'touch') throw new Error(`cooldown pointer ${waiting.lastTriggerPointer}`)
  if (!waiting.sunsetPlaying) throw new Error('cooldown line showed after dusk had already ended')
  results.touch.chairCooldown = { pointer: waiting.lastTriggerPointer, full: waiting.full, playing: waiting.sunsetPlaying }
  await closeDialogue(page, true)

  if (!opened.has('rose') || !opened.has('chair')) {
    throw new Error(`missing required taps: ${[...opened].join(',')}`)
  }
  const others = [...opened].filter((id) => id !== 'rose' && id !== 'chair')
  if (others.length === 0) throw new Error('no prop besides the rose and the chair was opened')

  const hint = await walkUntilHint(page)
  results.touch.hint = hint
  await page.screenshot({ path: `${shots}/hint_coarse.png` })
  errors.assertClean('touch end')
  await context.close()
}

async function runDrawCalls() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    hasTouch: false,
    isMobile: false,
    deviceScaleFactor: 1,
  })
  await context.addInitScript(() => localStorage.removeItem('little-planet.save.v1'))
  const page = await context.newPage()
  const errors = collect(page, 'desktop')
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__littlePlanet, null, { timeout: 15000 })
  await beginPlay(page)
  await page.waitForTimeout(400)
  results.perf.spawn = await samplePerf(page, 900)
  results.perf.maxDrawCalls = await page.evaluate(() => window.__littlePlanet.maxDrawCalls())
  results.perf.panel = await page.locator('.perf-panel').innerText()
  const desktopHint = await page.evaluate(() => {
    const coarse = window.matchMedia('(pointer: coarse)').matches
    return coarse ? '轻触' : 'E / 点击'
  })
  results.perf.desktopHintLabel = desktopHint
  if (desktopHint !== 'E / 点击') throw new Error(`desktop hint label was ${desktopHint}`)
  errors.assertClean('draw calls')
  await context.close()
}

async function beginPlay(page) {
  const play = page.locator('[data-action="play"]')
  await play.waitFor({ state: 'visible', timeout: 8000 })
  const label = (await play.innerText()).trim()
  if (label !== '开始') throw new Error(`title button was ${JSON.stringify(label)}, wanted 开始`)
  await play.click()
  await page.waitForFunction(() => window.__littlePlanet.session().mode === 'play', null, { timeout: 8000 })
}

async function tapProp(page, point, id) {
  await page.touchscreen.tap(point.x, point.y)
  await page.waitForFunction(() => window.__littlePlanet.state().dialogueOpen, null, { timeout: 2000 })
  const next = await state(page)
  if (next.lastTriggerId !== id) throw new Error(`${id} tap triggered ${next.lastTriggerId} at ${JSON.stringify(point)}`)
  if (next.lastTriggerPointer !== 'touch') throw new Error(`${id} pointer ${next.lastTriggerPointer}`)
}

async function onScreen(page) {
  const found = await page.evaluate((ids) => {
    const hits = new Map()
    const width = window.innerWidth
    const height = window.innerHeight
    for (let y = 8; y < height - 8; y += 10) {
      for (let x = 8; x < width - 8; x += 10) {
        const id = window.__littlePlanet.pick(x, y)
        if (!id || hits.has(id)) continue
        hits.set(id, { id, x, y })
      }
    }
    return ids.map((id) => hits.get(id)).filter(Boolean)
  }, PROP_IDS)
  return found
}

async function reveal(page, id) {
  for (let i = 0; i < 42; i++) {
    const hit = await page.evaluate((target) => {
      for (let y = 36; y < window.innerHeight - 48; y += 24) {
        for (let x = 10; x < window.innerWidth - 10; x += 24) {
          if (window.__littlePlanet.pick(x, y) === target) return { id: target, x, y }
        }
      }
      return null
    }, id)
    if (hit) return hit
    await orbit(page, 36, 0)
  }
  throw new Error(`${id} never came on screen`)
}

async function approach(page, id) {
  for (let i = 0; i < 48; i++) {
    const hit = await hittable(page, id)
    if (hit) return hit
    const projected = await page.evaluate((target) => window.__littlePlanet.project(target), id)
    let turn = 70
    if (projected && projected.x > -240 && projected.x < 630) {
      turn = Math.max(-80, Math.min(80, (projected.x - 195) * 0.4))
    }
    if (Math.abs(turn) > 12) await orbit(page, turn, 0)
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(180)
    await page.keyboard.up('KeyW')
  }
  throw new Error(`${id} never became visible`)
}

async function hittable(page, id) {
  return page.evaluate((target) => {
    const projected = window.__littlePlanet.project(target)
    if (!projected) return null
    for (let dy = -32; dy <= 32; dy += 8) {
      for (let dx = -32; dx <= 32; dx += 8) {
        const x = projected.x + dx
        const y = projected.y + dy
        if (x < 8 || y < 8 || x > window.innerWidth - 8 || y > window.innerHeight - 8) continue
        if (window.__littlePlanet.pick(x, y) === target) return { id: target, x, y }
      }
    }
    return null
  }, id)
}

async function orbit(page, dx, dy) {
  const box = await page.locator('canvas').boundingBox()
  if (!box) throw new Error('canvas missing')
  const x = box.x + box.width * 0.55
  const y = box.y + box.height * 0.38
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(160)
}

async function walkUntilHint(page) {
  for (let step = 0; step < 20; step++) {
    const hint = page.locator('.interact-hint')
    if (await hint.isVisible()) {
      const text = (await hint.innerText()).trim()
      const target = await hint.getAttribute('data-target')
      const coarseNow = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)
      if (text === '轻触' && target) return { text, target, coarse: coarseNow }
      throw new Error(`hint text was ${JSON.stringify(text)} target=${target} coarse=${coarseNow}`)
    }
    const projected = await page.evaluate(() => window.__littlePlanet.project('chair'))
    if (projected && Math.abs(projected.x - 195) > 40) {
      await orbit(page, Math.max(-70, Math.min(70, (projected.x - 195) * 0.35)), 0)
    }
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(220)
    await page.keyboard.up('KeyW')
  }
  throw new Error('coarse hint never appeared')
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

async function touchDrag(client, x0, y0, x1, y1) {
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
