import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.use({ serviceWorkers: 'block' })
async function fixture(page: Page, language = 'en') {
  await page.addInitScript(language => {
    localStorage.setItem('zekr.settings', JSON.stringify({ lang: language, translations: ['fa.safavi'], theme: 'light' }))
    localStorage.setItem('zekr.inlineDefault', 'true')
  }, language)
  let first = 0
  await page.route('**/data/meta.json*', async r => {
    const response = await r.fetch(), meta = await response.json()
    first = meta.surahs[111].first
    delete meta.mushaf
    await r.fulfill({ response, json: { ...meta, wbw: 'fa', morphology: { version: 'word-fixture', source: 'Invented morphology' } } })
  })
  await page.route('**/data/text/*.json*', async r => {
    const response = await r.fetch(), text = (await response.json()).map(() => 'نص تجريبي')
    text[first - 1] = 'وَكَتَبَ سليم كِتَابًا'; text[first] = 'يَكْتُبُ سليم'
    await r.fulfill({ response, json: text })
  })
  await page.route('**/data/tr/fa.*.json*', async r => {
    const response = await r.fetch(), text = (await response.json()).map(() => 'متن آزمایشی')
    text[first - 1] = 'ایمان در یک متن ساختگی'; text[first] = 'ایمان برای آزمون'
    await r.fulfill({ response, json: text })
  })
  await page.route('**/data/wbw/112.json*', r => r.fulfill({ json: [[['وَكَتَبَ', 'نوشت'], ['سليم', 'نمونه'], ['كِتَابًا', 'کتابی']], [['يَكْتُبُ', 'می‌نویسد'], ['سليم', 'نمونه']], [], []] }))
  await page.route('**/data/search/morphology.json*', r => r.fulfill({ json: { version: 'fixture', source: 'Invented morphology', roots: ['كتب'], forms: { 'وكتب': [0], 'كتابا': [0], 'يكتب': [0] }, ayahs: Array.from({ length: 6236 }, (_, i) => i === first - 1 || i === first ? [0] : []) } }))
}
async function point(page: Page, selector: string, word: string) {
  await page.evaluate(() => document.fonts.ready)
  return page.locator(selector).evaluate((el, word) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      const at = node.textContent?.indexOf(word) ?? -1
      if (at < 0) continue
      const range = document.createRange(); range.setStart(node, at); range.setEnd(node, at + word.length)
      const box = range.getBoundingClientRect()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    }
    throw new Error('Fixture word is missing')
  }, word)
}

test('an Arabic word opens root and exact searches without eager morphology loading', async ({ page }) => {
  await fixture(page)
  const morphology: string[] = []
  page.on('request', r => { if (r.url().includes('morphology.json')) morphology.push(r.url()) })
  await page.goto('/#/verse/112/1')
  const p = await point(page, '.study-reader #a-1 .ar', 'وَكَتَبَ')
  expect(morphology).toHaveLength(0)
  await page.mouse.click(p.x, p.y, { button: 'right' })
  const bar = page.getByRole('toolbar', { name: 'Word actions' })
  await expect(bar).toBeVisible()
  await bar.getByRole('button', { name: 'Find in the Quran' }).click()
  const dialog = page.getByRole('dialog', { name: 'Word actions' })
  await expect(dialog.locator('.word-display')).toHaveText('وَكَتَبَ')
  await expect(dialog.getByRole('link', { name: /Arabic root/ })).toContainText('2 ayahs')
  expect((await new AxeBuilder({ page }).exclude('.mushaf-host').analyze()).violations).toEqual([])
  await dialog.getByRole('link', { name: /Arabic root/ }).click()
  await expect(page).toHaveURL(/mode=root&in=ar/)
  await expect(page.locator('.search-results .search-result')).toHaveCount(2)
  await page.goBack()
  await expect(page.locator('.study-reader #a-1')).toHaveClass(/focused/)
})

test('a translation selection searches only its source, including one not selected globally', async ({ page }) => {
  await fixture(page)
  await page.goto('/#/verse/112/1')
  const p = await point(page, '.study-reader #a-1 .tr', 'ایمان')
  await page.mouse.dblclick(p.x, p.y)
  await page.getByRole('toolbar').getByRole('button', { name: 'Find in the Quran' }).click()
  await page.getByRole('dialog').getByRole('link').click()
  await expect(page).toHaveURL(/in=fa.safavi/)
  await expect(page.locator('.search-results .search-result')).toHaveCount(2)
  await page.goto('/#/search?q=ایمان&mode=exact&in=fa.fooladvand')
  await expect(page.locator('.search-results .search-result')).toHaveCount(2)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('zekr.settings')!).translations)).toEqual(['fa.safavi'])
})

test('the Words action is reachable by keyboard and restores focus', async ({ page }) => {
  await fixture(page)
  await page.goto('/#/verse/112/1')
  await page.locator('.study-reader #a-1 .study-marker').click()
  await page.locator('.study-reader #a-1 .study-more').getByRole('button', { name: 'Words', exact: true }).press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Words', exact: true })
  await expect(dialog.getByRole('button', { name: 'وَكَتَبَ', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.study-reader #a-1 .study-more').getByRole('button', { name: 'Words', exact: true })).toBeFocused()
})

test('a phone long press selects a word; movement cancels it', async ({ page, context }) => {
  await fixture(page, 'fa')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/verse/112/1')
  const p = await point(page, '.study-reader #a-1 .ar', 'وَكَتَبَ')
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] })
  await page.waitForTimeout(550)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.getByRole('toolbar', { name: 'گزینه‌های واژه' })).toBeVisible()
  await page.reload()
  const moved = await point(page, '.study-reader #a-1 .ar', 'وَكَتَبَ')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [moved] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: moved.x + 25, y: moved.y }] })
  await page.waitForTimeout(550)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.getByRole('toolbar')).toHaveCount(0)
})


test('meaning shows a gloss, exact counts, attested forms and an ayah jump', async ({ page }) => {
  await fixture(page)
  await page.goto('/#/verse/112/1')
  const p = await point(page, '.study-reader #a-1 .ar', 'وَكَتَبَ')
  await page.mouse.click(p.x, p.y, { button: 'right' })
  await page.getByRole('toolbar').getByRole('button', { name: 'Meaning', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.word-gloss')).toHaveText('نوشت')
  await expect(dialog.locator('.word-count')).toHaveText('This form: 1 occurrence in 1 ayah')
  await expect(dialog.getByRole('button', { name: 'كتب', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'يَكْتُبُ', exact: true }).click()
  await expect(dialog.locator('.word-gloss')).toHaveText('می‌نویسد')
  await dialog.locator('.word-verses a').click()
  await expect(page).toHaveURL(/verse\/112\/2/)
  await expect(dialog).toHaveCount(0)
})

for (const language of ['en', 'fa']) for (const theme of ['light', 'sepia', 'dark']) {
  test(`word sheet is accessible and fits: ${language}, ${theme}`, async ({ page }) => {
    await fixture(page, language)
    await page.addInitScript(theme => { const s = JSON.parse(localStorage.getItem('zekr.settings')!); s.theme = theme; localStorage.setItem('zekr.settings', JSON.stringify(s)) }, theme)
    await page.goto('/#/verse/112/1')
    const p = await point(page, '.study-reader #a-1 .ar', 'وَكَتَبَ')
    await page.mouse.click(p.x, p.y, { button: 'right' })
    await page.getByRole('toolbar').getByRole('button', { name: language === 'fa' ? 'معنی' : 'Meaning', exact: true }).click()
    await expect(page.locator('.word-gloss')).toHaveText('نوشت')
    expect((await new AxeBuilder({ page }).exclude('.mushaf-host').analyze()).violations).toEqual([])
    expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  })
}

test('copy preserves the word, ayah and source; saved words survive a reload', async ({ page }) => {
  await fixture(page)
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text } } }))
  await page.goto('/#/verse/112/1')
  const p = await point(page, '.study-reader #a-1 .tr', 'ایمان')
  await page.mouse.dblclick(p.x, p.y)
  await page.getByRole('toolbar').getByRole('button', { name: 'Copy', exact: true }).click()
  await page.getByRole('button', { name: 'Copy with ayah', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Copied.')
  const copied = await page.evaluate(() => (window as unknown as { copied: string }).copied)
  expect(copied).toContain('ایمان\nایمان در یک متن ساختگی\n'); expect(copied).toContain('112:1')
  await page.getByRole('button', { name: 'Save word', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Remove saved word', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.goto('/#/saved?tab=words')
  await page.reload()
  const saved = page.locator('.saved-word')
  await expect(saved).toHaveCount(1)
  await expect(saved.locator('b')).toHaveText('ایمان')
  await saved.getByRole('button').first().click()
  await page.getByRole('toolbar').getByRole('button', { name: 'Meaning', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('This is a translation word')
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
  await saved.getByRole('button', { name: 'Remove ایمان', exact: true }).click()
  await expect(saved).toHaveCount(0)
})

test('a word card shares text with attribution and exports a local PNG', async ({ page }) => {
  await fixture(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined })
    Object.defineProperty(navigator, 'canShare', { value: () => false })
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text } } })
  })
  await page.goto('/#/verse/112/1')
  const p = await point(page, '.study-reader #a-1 .ar', 'وَكَتَبَ')
  await page.mouse.click(p.x, p.y, { button: 'right' })
  await page.getByRole('toolbar').getByRole('button', { name: 'Share', exact: true }).click()
  await page.getByRole('button', { name: 'Share as text', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Copied.')
  const copied = await page.evaluate(() => (window as unknown as { copied: string }).copied)
  expect(copied).toContain('وَكَتَبَ\nنوشت\nریشه: كتب'); expect(copied).toContain('112:1'); expect(copied).toContain('Ayesheno')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Share as picture', exact: true }).click()
  const download = await downloadPromise
  const { readFile } = await import('node:fs/promises')
  const bytes = await readFile((await download.path())!)
  expect(bytes.subarray(1, 4).toString()).toBe('PNG')
  expect(bytes.readUInt32BE(16)).toBe(1080)
  expect(bytes.readUInt32BE(20)).toBeGreaterThanOrEqual(660)
  expect(bytes.length).toBeGreaterThan(10000)
})

test('several possible roots remain visible and filter the forms', async ({ page }) => {
  await fixture(page)
  await page.route('**/data/search/morphology.json*', async r => {
    const meta = await (await page.request.get('/data/meta.json')).json(), first = meta.surahs[111].first
    await r.fulfill({ json: { version: 'ambiguous', source: 'Invented', roots: ['كتب', 'سلم'], forms: { وكتب: [0], كتابا: [0], يكتب: [0], سليم: [0, 1] }, ayahs: Array.from({ length: 6236 }, (_, i) => i === first - 1 || i === first ? [0, 1] : []) } })
  })
  await page.goto('/#/verse/112/1')
  const p = await point(page, '.study-reader #a-1 .ar', 'سليم')
  await page.mouse.click(p.x, p.y, { button: 'right' })
  await page.getByRole('toolbar').getByRole('button', { name: 'Meaning', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('several possible roots')
  await page.getByRole('button', { name: 'سلم', exact: true }).click()
  await expect(page.locator('.word-forms button')).toHaveCount(1)
  await expect(page.locator('.word-forms button')).toHaveText('سليم')
})
