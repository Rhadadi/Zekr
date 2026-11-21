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
    await r.fulfill({ response, json: { ...meta, morphology: { version: 'word-fixture', source: 'Invented morphology' } } })
  })
  await page.route('**/data/text/*.json*', async r => {
    const response = await r.fetch(), text = await response.json()
    text[first - 1] = 'وَكَتَبَ سليم كِتَابًا'; text[first] = 'يَكْتُبُ سليم'
    await r.fulfill({ response, json: text })
  })
  await page.route('**/data/tr/fa.*.json*', async r => {
    const response = await r.fetch(), text = (await response.json()).map(() => 'متن آزمایشی')
    text[first - 1] = 'ایمان در یک متن ساختگی'; text[first] = 'ایمان برای آزمون'
    await r.fulfill({ response, json: text })
  })
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
