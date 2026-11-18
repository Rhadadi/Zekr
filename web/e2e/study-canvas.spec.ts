import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// The real Quran/translation data exercise long text. Study notes and word meanings here are invented fixtures.
async function fixture(page: Page, lang = 'en', theme = 'light', translations = ['fa.safavi']) {
  await page.addInitScript(({ language, appearance, selected }) => {
    localStorage.setItem('zekr.settings', JSON.stringify({
      lang: language, theme: appearance, translations: selected, autoScroll: true,
    }))
    localStorage.setItem('zekr.inlineDefault', 'true')
    const w = window as unknown as { canvasAudio: EventTarget[]; canvasPlayed: string[] }
    w.canvasAudio = []; w.canvasPlayed = []
    class FixtureAudio extends EventTarget {
      src = ''; preload = ''; currentTime = 0; duration = 90
      paused = true; ended = false; defaultPlaybackRate = 1; playbackRate = 1
      play() {
        if (!w.canvasAudio.includes(this)) w.canvasAudio.push(this)
        w.canvasPlayed.push(this.src)
        this.paused = false
        this.dispatchEvent(new Event('playing'))
        return Promise.resolve()
      }
      pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
      removeAttribute(name: string) { if (name === 'src') this.src = '' }
      getAttribute(name: string) { return name === 'src' ? this.src : null }
      load() { /* media stays local to the test */ }
    }
    window.Audio = FixtureAudio as unknown as typeof Audio
  }, { language: lang, appearance: theme, selected: translations })
  await page.route('**/everyayah.com/**', (route) => route.abort())
  let first = 0
  await page.route('**/data/meta.json*', async (route) => {
    const response = await route.fetch()
    const meta = await response.json()
    first = meta.surahs.find((s: { id: number }) => s.id === 112).first
    await route.fulfill({ response, json: { ...meta, wbw: 'fa', studyQuran: {
      id: 'study_quran', name: 'The Study Quran', pdfSha256: 'fixture', importVersion: 'fixture',
    } } })
  })
  await page.route('**/data/tafsir/study_quran/*.json*', (route) => route.fulfill({ json: { entries: [], byAyah: {} } }))
  await page.route('**/data/tafsir/study_quran/112.json*', (route) => route.fulfill({ json: {
    surah: 112,
    entries: [{
      id: 'canvas-example', surah_id: 112, note_label: '1', first_ayah: 1, last_ayah: 1,
      coverage_kind: 'explicit_note', lemma_text: '', html: '', text: 'An invented note for the Study canvas.',
      ayah_ids: [first], pages: [1], references: [],
    }],
    byAyah: { [String(first)]: ['canvas-example'] },
  } }))
  await page.route('**/data/wbw/112.json*', (route) => route.fulfill({
    json: Array.from({ length: 4 }, () => [['مثال', 'معنای نمونه']]),
  }))
  await page.route('**/data/intro/study_quran/*.json*', (route) => route.fulfill({ json: { text: '', html: '', pages: [] } }))
}

test.use({ serviceWorkers: 'block' })

for (const language of ['en', 'fa']) for (const theme of ['light', 'sepia', 'dark']) test(`bilingual reading keeps complete translations together: ${language}, ${theme}`, async ({ page }, testInfo) => {
  await fixture(page, language, theme, ['fa.safavi', 'en.sahih'])
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/#/verse/69/9')
  const reader = page.locator('.study-reader')
  const pair = reader.locator('#a-9 .study-translations')
  const persian = pair.locator('[data-language="fa"]')
  const english = pair.locator('[data-language="en"]')
  await expect(english.locator('.tr')).not.toBeEmpty()
  await page.evaluate(() => document.fonts.ready)
  const original = await pair.allTextContents()
  const faBox = (await persian.boundingBox())!
  const enBox = (await english.boundingBox())!
  expect(Math.abs(faBox.x - enBox.x)).toBeLessThan(2)
  expect(enBox.y).toBeGreaterThanOrEqual(faBox.y + faBox.height)
  expect(faBox.width).toBeLessThanOrEqual(740)
  await expect(reader.locator('.study-modes [aria-current="page"]')).toHaveText(language === 'fa' ? 'مطالعه' : 'Study')
  await expect(reader.locator('.study-modes a')).toHaveAttribute('href', '#/ayah/69/9')
  await page.screenshot({ path: testInfo.outputPath('reading-desktop.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect.poll(async () => (await english.boundingBox())!.y - (await persian.boundingBox())!.y).toBeGreaterThan(20)
  expect(await pair.allTextContents()).toEqual(original)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0)
  const toolbar = reader.locator('.study-toolbar')
  for (const el of await toolbar.locator('a,button').all()) {
    const box = (await el.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
  }
  await page.screenshot({ path: testInfo.outputPath('reading-mobile.png') })
})

test('a short ayah stays visible with its notes and passage tools', async ({ page }) => {
  await fixture(page)
  await page.goto('/#/verse/112/1')
  const reader = page.locator('.study-reader')
  await reader.getByRole('tab', { name: 'Tafsir', exact: true }).click()
  await expect(reader.getByRole('tabpanel')).toContainText('An invented note for the Study canvas.')
  const arabic = (await reader.locator('#a-1 .ar').boundingBox())!
  const toolbar = (await reader.locator('.study-toolbar').boundingBox())!
  expect(arabic.y).toBeGreaterThanOrEqual(toolbar.y + toolbar.height)
  expect(arabic.y + arabic.height).toBeLessThan(500)
  await reader.locator('.study-edition-toggle').click()
  await expect(reader.locator('.study-edition')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(reader.locator('.study-edition')).toHaveCount(0)
  await expect(reader.locator('.study-edition-toggle')).toBeFocused()
  await expect(page).toHaveURL(/#\/verse\/112\/1$/)
})

for (const lang of ['en', 'fa']) for (const theme of ['light', 'sepia', 'dark']) {
  test(`a long ayah remains complete and readable: ${lang}, ${theme}`, async ({ page }) => {
    await fixture(page, lang, theme)
    const textResponse = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/text/uthmani.json'))
    await page.goto('/#/verse/2/282')
    const text = await (await textResponse).json() as string[]
    const reader = page.locator('.study-reader')
    const ayah = reader.locator('article#a-282')
    await expect(ayah.locator('.ar')).toContainText(text[288]!)
    await expect(ayah.locator('.tr')).not.toBeEmpty()
    await expect(reader.getByRole('button', { name: lang === 'fa' ? 'تنظیمات' : 'Settings', exact: true })).toBeVisible()
    for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(size)
      await expect(reader.getByRole('heading', { level: 1 })).toContainText(lang === 'fa' ? '۲۸۲' : '282')
      const layout = await ayah.locator('.ar').evaluate((el) => ({
        fontSize: parseFloat(getComputedStyle(el).fontSize),
        lineClamp: getComputedStyle(el).webkitLineClamp,
        hidden: el.scrollHeight - el.clientHeight,
        width: el.getBoundingClientRect().width,
        height: el.getBoundingClientRect().height,
        overflow: document.documentElement.scrollWidth - innerWidth,
      }))
      expect(layout.fontSize).toBeGreaterThanOrEqual(28)
      expect(layout.lineClamp).toBe('none')
      expect(layout.hidden).toBeLessThanOrEqual(2)
      expect(layout.width).toBeLessThanOrEqual(size.width)
      expect(layout.height).toBeGreaterThan(200)
      expect(layout.overflow).toBeLessThanOrEqual(0)
      // The companion follows the Arabic in the same document, rather than covering it.
      const arabicBox = (await ayah.locator('.ar').boundingBox())!
      const companionBox = (await ayah.locator('.study-companion').boundingBox())!
      expect(companionBox.y).toBeGreaterThanOrEqual(arabicBox.y + arabicBox.height - 1)
    }
  })
}

for (const lang of ['en', 'fa']) for (const theme of ['light', 'sepia', 'dark']) {
  test(`Study companion tabs remain accessible: ${lang}, ${theme}`, async ({ page }, testInfo) => {
    test.setTimeout(90_000)
    await fixture(page, lang, theme)
    await page.goto('/#/verse/112/1')
    const reader = page.locator('.study-reader')
    for (const tab of ['tafsir', 'words']) {
      await reader.locator(`#study-tab-${tab}`).click()
      await expect(reader.getByRole('tabpanel')).not.toBeEmpty()
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.mushaf-host').analyze()
      expect(result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
    }
    await reader.getByRole('button', { name: lang === 'fa' ? 'تنظیمات' : 'Settings', exact: true }).click()
    const settingsPanel = page.getByRole('dialog', { name: lang === 'fa' ? 'تنظیمات' : 'Settings', exact: true })
    await expect(settingsPanel).toBeVisible()
    await expect(settingsPanel.locator('.drawer-search, .drawer-modes')).toHaveCount(0)
    expect((await settingsPanel.boundingBox())!.width).toBeLessThanOrEqual(340)
    const settingsResult = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.mushaf-host').analyze()
    expect(settingsResult.violations).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('reading-settings.png') })
  })
}

test('Study tools are keyboard-operable and retain the selected ayah', async ({ page }) => {
  await fixture(page)
  await page.goto('/#/verse/112/1')
  const reader = page.locator('.study-reader')
  const ayah = reader.locator('article#a-1')
  const translation = reader.getByRole('tab', { name: 'Translation', exact: true })
  const tafsir = reader.getByRole('tab', { name: 'Tafsir', exact: true })
  const words = reader.getByRole('tab', { name: 'Words', exact: true })
  await expect(translation).toHaveAttribute('aria-selected', 'true')
  await translation.press('ArrowRight')
  await expect(tafsir).toBeFocused()
  await expect(tafsir).toHaveAttribute('aria-selected', 'true')
  await expect(ayah.getByRole('tabpanel')).toContainText('An invented note for the Study canvas.')
  await tafsir.press('End')
  await expect(words).toBeFocused()
  await expect(words).toHaveAttribute('aria-selected', 'true')
  await expect(ayah.getByRole('tabpanel')).toContainText('معنای نمونه')
  await words.press('Home')
  await expect(translation).toBeFocused()
  await expect(translation).toHaveAttribute('aria-selected', 'true')
  await expect(ayah.getByRole('tabpanel').locator('.tr')).not.toBeEmpty()
  await expect(page).toHaveURL(/#\/verse\/112\/1$/)
})

test('closing Study returns to the underlying Quran page and settings stays accessible', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await fixture(page)
  await page.goto('/#/page/235')
  await expect(page.locator('#page-235')).toBeVisible()
  await expect(page.locator('.study-reader')).toHaveCount(0)
  await page.goto('/#/verse/12/2')
  const reader = page.locator('.study-reader')
  await expect(reader).toBeVisible()
  const logo = reader.getByRole('img', { name: 'Ayesheno', exact: true })
  await expect(logo).toBeVisible()
  expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  await reader.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.locator('.drawer')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible()
  await expect(page.locator('.drawer-search')).toHaveCount(0)
  await expect(page.locator('.drawer-modes')).toHaveCount(0)
  await expect(page.getByLabel('Quran font')).toBeVisible()
  const settingsA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.mushaf-host').analyze()
  expect(settingsA11y.violations).toEqual([])
  await page.keyboard.press('Escape')
  await expect(page.locator('.drawer')).toHaveCount(0)
  await expect(reader.getByRole('button', { name: 'Settings', exact: true })).toBeFocused()
  await reader.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page).toHaveURL(/#\/page\/235$/)
  await expect(page.locator('#page-235')).toBeVisible()
  await expect(reader).toHaveCount(0)
})

test('Focus keeps a complete long ayah and navigates without exposing neighbouring verses', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await fixture(page)
  await page.goto('/#/verse/2/282')
  const reader = page.locator('.study-reader')
  const arabic = reader.locator('#a-282 .ar')
  await expect(arabic).not.toBeEmpty()
  const text = await arabic.textContent()
  const size = await arabic.evaluate(el => getComputedStyle(el).fontSize)
  await reader.getByRole('button', { name: 'Focus on one ayah', exact: true }).click()
  await expect(reader).toHaveAttribute('data-focus', 'true')
  await expect(reader.locator('article.ayah:visible')).toHaveCount(1)
  await expect(arabic).toHaveText(text!)
  await expect(arabic).toHaveCSS('font-size', size)
  await expect(reader.locator('#a-282 .tr')).not.toBeEmpty()
  await reader.getByRole('button', { name: 'Next ayah', exact: true }).click()
  await expect(reader.locator('#a-283')).toBeVisible()
  await expect(reader.locator('article.ayah:visible')).toHaveCount(1)
  await page.keyboard.press('f')
  await expect(reader).toHaveAttribute('data-focus', 'false')
  await expect(reader.locator('article.ayah:visible')).toHaveCount(286)
  await expect(reader.getByRole('heading', { level: 1 })).toContainText('283')
})

for (const lang of ['en', 'fa']) for (const width of [390, 1280]) {
  test(`the menu opens Study at the current passage: ${lang}, ${width}px`, async ({ page }) => {
    await fixture(page, lang)
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/#/ayah/12/2')
    await expect(page.locator('#page-235')).toBeVisible()
    await page.getByRole('button', { name: lang === 'fa' ? 'منو' : 'Menu', exact: true }).click()
    const modes = page.locator('.drawer-modes')
    const reading = modes.getByRole('link', { name: lang === 'fa' ? 'خواندن' : 'Reading', exact: true })
    await expect(reading).toHaveAttribute('aria-current', 'page')
    const modeBox = (await modes.boundingBox())!
    const searchBox = (await page.locator('.drawer-search').boundingBox())!
    expect(modeBox.y + modeBox.height).toBeLessThanOrEqual(searchBox.y)
    const study = page.locator('.drawer').getByRole('link', { name: lang === 'fa' ? 'مطالعه' : 'Study', exact: true })
    await expect(study).toBeVisible()
    await expect(study).toHaveAttribute('href', '#/verse/12/2')
    await study.click()
    await expect(page.locator('.study-reader')).toBeVisible()
    await expect(page).toHaveURL(/#\/verse\/12\/2$/)
    const logo = page.locator('.study-reader').getByRole('img', { name: lang === 'fa' ? 'آیه شنو' : 'Ayesheno', exact: true })
    await expect(logo).toBeVisible()
    const box = await logo.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(80)
    await page.locator('.study-reader').getByRole('button', { name: lang === 'fa' ? 'آیهٔ بعد' : 'Next ayah', exact: true }).click()
    const menu = page.locator('.study-reader').getByRole('button', { name: lang === 'fa' ? 'منو' : 'Menu', exact: true })
    await menu.click()
    await expect(page.locator('.drawer').getByRole('link', { name: lang === 'fa' ? 'مطالعه' : 'Study', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(reading).toHaveAttribute('href', '#/ayah/12/3')
    await page.keyboard.press('Escape')
    await expect(page.locator('.drawer')).toHaveCount(0)
    await expect(menu).toBeFocused()
    await menu.click()
    await reading.click()
    await expect(page).toHaveURL(/#\/ayah\/12\/3$/)
    await expect(page.locator('.study-reader')).toHaveCount(0)
  })
}

test('incidental scrolling keeps the passage, while manual browsing updates it', async ({ page }) => {
  await fixture(page)
  await page.goto('/#/verse/12/3')
  const reader = page.locator('.study-reader')
  const layer = page.locator('.study-layer')
  await expect(reader.locator('#a-3 .ar')).not.toBeEmpty()
  await page.evaluate(() => document.fonts.ready)
  await expect.poll(() => reader.locator('#a-3').evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(185)
  // A focus/layout adjustment can scroll the container without a browsing gesture.
  await layer.evaluate(el => el.scrollTo(0, 0))
  await expect.poll(() => layer.evaluate(el => el.scrollTop)).toBe(0)
  await reader.getByRole('button', { name: 'Menu', exact: true }).click()
  await expect(page.locator('.drawer-modes').getByRole('link', { name: 'Reading', exact: true })).toHaveAttribute('href', '#/ayah/12/3')
  await page.keyboard.press('Escape')
  await expect(page.locator('.drawer')).toHaveCount(0)
  await page.mouse.move(200, 360)
  await page.mouse.wheel(0, 1200)
  await expect.poll(() => reader.getByRole('heading', { level: 1 }).textContent()).not.toContain('3 / 111')
  await expect.poll(() => reader.locator('article.focused').getAttribute('data-ayah')).not.toBe('3')
})

test('manual browsing suspends following without interrupting recitation', async ({ page }) => {
  await fixture(page)
  await page.goto('/#/verse/2/282')
  const reader = page.locator('.study-reader')
  const ayah = reader.locator('article#a-282')
  await reader.getByRole('button', { name: 'Play from here', exact: true }).click()
  await expect(page.locator('.player')).toHaveAttribute('data-status', 'playing')
  await expect(ayah).toHaveClass(/playing/)
  const follow = reader.getByRole('button', { name: 'Return to recitation', exact: true })
  await expect(follow).toHaveCount(0)
  await page.mouse.move(200, 360)
  await page.mouse.wheel(0, 600)
  await expect(follow).toBeVisible()
  await expect(page.locator('.player')).toHaveAttribute('data-status', 'playing')
  await follow.click()
  await expect(follow).toHaveCount(0)
  await expect(page.locator('.player')).toHaveAttribute('data-status', 'playing')
  // Opening study material also lets the reader browse without being pulled back by audio.
  await reader.getByRole('tab', { name: 'Tafsir', exact: true }).click()
  await expect(follow).toBeVisible()
  await expect(page.locator('.player')).toHaveAttribute('data-status', 'playing')
})

test('starting recitation after browsing follows and highlights each new ayah', async ({ page }) => {
  await fixture(page)
  await page.goto('/#/verse/112/1')
  const reader = page.locator('.study-reader')
  await reader.getByRole('button', { name: 'Next ayah', exact: true }).click()
  await expect(reader.locator('article.focused')).toHaveAttribute('data-ayah', '2')
  await reader.getByRole('button', { name: 'Play from here', exact: true }).click()
  await expect(reader.locator('article.focused.playing')).toHaveAttribute('data-ayah', '2')
  await page.evaluate(() => {
    const w = window as unknown as { canvasAudio: EventTarget[] }
    w.canvasAudio.at(-1)!.dispatchEvent(new Event('ended'))
  })
  const active = reader.locator('article.focused.playing')
  await expect(active).toHaveAttribute('data-ayah', '3')
  await expect.poll(() => active.evaluate(el => el.getBoundingClientRect().top)).toBeLessThanOrEqual(185)
  await expect.poll(() => active.evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(100)
  expect(await active.evaluate(el => getComputedStyle(el, '::after').backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
  await expect(reader.getByRole('button', { name: 'Return to recitation', exact: true })).toHaveCount(0)
})

test('starting recitation from the keyboard keeps Pause within reach', async ({ page }) => {
  await fixture(page)
  await page.goto('/#/verse/112/1')
  await page.locator('.study-reader').getByRole('button', { name: 'Play from here', exact: true }).press('Enter')
  const pause = page.locator('.player').getByRole('button', { name: 'Pause', exact: true })
  await expect(pause).toBeFocused()
  await pause.press('Space')
  await expect(page.locator('.player')).toHaveAttribute('data-status', 'paused')
  await expect(page.locator('.player').getByRole('button', { name: 'Play', exact: true })).toBeFocused()
})

test('changing language, theme and font keeps the selected ayah in place', async ({ page }) => {
  await fixture(page)
  await page.goto('/#/verse/2/282')
  const reader = page.locator('.study-reader')
  await expect(reader.locator('#a-282 .ar')).not.toBeEmpty()
  await reader.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.locator('.drawer').getByRole('button', { name: 'Sepia', exact: true }).click()
  await page.locator('.drawer').getByRole('combobox', { name: 'Quran font', exact: true }).selectOption('scheherazade')
  await page.locator('.drawer').getByRole('combobox', { name: 'Language', exact: true }).selectOption('fa')
  await page.locator('.drawer').getByRole('button', { name: 'بستن', exact: true }).click()
  await expect(reader.getByRole('heading', { level: 1 })).toContainText('۲۸۲')
  await expect.poll(() => reader.locator('#a-282').evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(110)
  await expect.poll(() => reader.locator('#a-282').evaluate(el => el.getBoundingClientRect().top)).toBeLessThanOrEqual(185)
})

test('recitation progress can be sought and resets for the next ayah', async ({ page }) => {
  await fixture(page)
  await page.goto('/#/verse/112/1')
  await page.locator('.study-reader').getByRole('button', { name: 'Play from here', exact: true }).click()
  const bar = page.locator('.player')
  await expect(bar).toHaveAttribute('data-status', 'playing')
  const position = bar.getByRole('slider', { name: 'Playback position', exact: true })
  await page.evaluate(() => {
    const w = window as unknown as { canvasAudio: (EventTarget & { currentTime: number; duration: number })[] }
    const audio = w.canvasAudio[0]!
    audio.duration = 90
    audio.currentTime = 13
    audio.dispatchEvent(new Event('loadedmetadata'))
    audio.dispatchEvent(new Event('timeupdate'))
  })
  await expect(position).toBeEnabled()
  await expect(position).toHaveAttribute('max', '90')
  await expect(position).toHaveValue('13')
  await position.press('End')
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { canvasAudio: { currentTime: number }[] }).canvasAudio[0]!.currentTime,
  )).toBe(90)
  await position.press('Home')
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { canvasAudio: { currentTime: number }[] }).canvasAudio[0]!.currentTime,
  )).toBe(0)
  await bar.getByRole('button', { name: 'Next ayah', exact: true }).click()
  await expect(bar).toContainText('112:2')
  await expect(position).toHaveValue('0')
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { canvasPlayed: string[] }).canvasPlayed.at(-1),
  )).toContain('112002.mp3')
})

for (const language of ['en', 'fa']) test(`recitation controls stay beneath the reading column: ${language}`, async ({ page }) => {
  await fixture(page, language, 'dark')
  await page.goto('/#/verse/112/1')
  await page.locator('.study-listen').click()
  const transport = page.locator('.player')
  await expect(transport).toHaveAttribute('data-status', 'playing')
  await page.setViewportSize({ width: 1280, height: 800 })
  const column = (await page.locator('.study-content').boundingBox())!
  const desktop = (await transport.boundingBox())!
  expect(Math.abs(desktop.x - column.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(desktop.width - column.width)).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 390, height: 844 })
  const mobile = (await transport.boundingBox())!
  expect(mobile.x).toBeGreaterThanOrEqual(12)
  expect(mobile.x + mobile.width).toBeLessThanOrEqual(378)
})
