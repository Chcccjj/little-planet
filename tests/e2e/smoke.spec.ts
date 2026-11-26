import { expect, test, type Page } from '@playwright/test'

const errors: string[] = []

function watch(page: Page): void {
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
}

async function waitForPaint(page: Page): Promise<void> {
  await page.waitForSelector('canvas', { timeout: 20_000 })
  await page.waitForFunction(() => {
    const canvas = document.querySelector('canvas')
    if (!canvas || canvas.width < 2 || canvas.height < 2) return false
    const probe = document.createElement('canvas')
    probe.width = 24
    probe.height = 24
    const context = probe.getContext('2d', { willReadFrequently: true })
    if (!context) return false
    context.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, 24, 24)
    const data = context.getImageData(0, 0, 24, 24).data
    let min = 255 * 3
    let max = 0
    for (let i = 0; i < data.length; i += 4) {
      const value = data[i] + data[i + 1] + data[i + 2]
      if (value < min) min = value
      if (value > max) max = value
    }
    return max - min > 12
  }, null, { timeout: 15_000 })
}

test.beforeEach(() => {
  errors.length = 0
})

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false })

  test('renders the asteroid without console errors', async ({ page }) => {
    watch(page)
    await page.goto('/')
    await waitForPaint(page)
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/)
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /user-scalable=no/)
    const chrome = await page.evaluate(() => {
      const body = getComputedStyle(document.body)
      return { overflow: body.overflow, touchAction: body.touchAction, position: body.position }
    })
    expect(chrome).toEqual({ overflow: 'hidden', touchAction: 'none', position: 'fixed' })
    await expect(page.locator('[data-joystick]')).toHaveCount(0)
    await page.screenshot({ path: 'test-results/smoke-desktop-title.png' })

    await page.getByRole('button', { name: '开始' }).click()
    await expect(page.getByRole('button', { name: '暂停' })).toBeVisible()
    await waitForPaint(page)
    await page.screenshot({ path: 'test-results/smoke-desktop-play.png' })
    expect(errors, errors.join('\n')).toEqual([])
  })
})

test.describe('phone', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  })

  test('keeps touch controls on screen in portrait and landscape', async ({ page }) => {
    watch(page)
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('/')
    await waitForPaint(page)
    const start = await page.getByRole('button', { name: '开始' }).boundingBox()
    expect(start).not.toBeNull()
    expect(start!.y).toBeGreaterThanOrEqual(0)
    expect(start!.y + start!.height).toBeLessThanOrEqual(568)
    await page.screenshot({ path: 'test-results/smoke-phone-title.png' })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '开始' }).click()
    const stick = page.locator('[data-joystick]')
    await expect(stick).toBeVisible()
    const stickBox = await stick.boundingBox()
    expect(stickBox).not.toBeNull()
    expect(stickBox!.y + stickBox!.height).toBeLessThanOrEqual(844)
    await waitForPaint(page)
    await page.screenshot({ path: 'test-results/smoke-phone-play.png' })

    await page.setViewportSize({ width: 844, height: 390 })
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas')
      return !!canvas && canvas.clientWidth >= 800 && canvas.clientHeight >= 320 && canvas.clientHeight <= 420
    })
    await page.getByRole('button', { name: '暂停' }).click()
    const card = await page.locator('.pause-card').boundingBox()
    expect(card).not.toBeNull()
    expect(card!.y).toBeGreaterThanOrEqual(0)
    expect(card!.y + card!.height).toBeLessThanOrEqual(390)
    await page.screenshot({ path: 'test-results/smoke-phone-landscape.png' })
    expect(errors, errors.join('\n')).toEqual([])
  })
})
