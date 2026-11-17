import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.use({ serviceWorkers: 'block' })
async function setup(page: Page, lang = 'en') {
  await page.addInitScript(language => localStorage.setItem('zekr.settings', JSON.stringify({
    lang: language, theme: 'dark', translations: ['fa.safavi', 'en.sahih'],
  })), lang)
  await page.route('**/data/meta.json*', async route => {
    const response = await route.fetch()
    const data = await response.json()
    delete data.studyQuran; delete data.mushaf; data.tafsir = []
    await route.fulfill({ response, json: data })
  })
}

test('an inflected query ranks literal ayahs first, then labels and highlights related roots', async ({ page }) => {
  await setup(page)
  await page.goto('/#/search?q=ضربتم')
  await expect(page.getByRole('button', { name: 'Search the root ضرب', exact: true })).toBeVisible()
  await expect(page.locator('.search-count')).toHaveText('54 results')
  const hits = page.locator('.search-result')
  for (let i = 0; i < 3; i++) await expect(hits.nth(i).locator('.search-reason')).toHaveCount(0)
  const related = hits.filter({ has: page.locator('.search-reason') }).first()
  await expect(related.locator('.ar mark')).not.toBeEmpty()
  await expect(related.locator('.search-reason')).toContainText('ضرب')
  await page.getByRole('combobox', { name: 'Search method', exact: true }).selectOption('exact')
  await expect(page.locator('.search-count')).toHaveText('3 results')
  await expect(page.locator('.search-reason')).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Surahs', exact: true }).selectOption('4')
  await expect(page.locator('.search-count')).toHaveText('2 results')
  await expect(page).toHaveURL(/mode=exact.*surah=4/)
})

for (const language of ['en', 'fa']) test(`Persian and Arabic keyboards return the same ayahs: ${language}`, async ({ page }) => {
  await setup(page, language)
  await page.goto('/#/search?q=كتاب')
  const input = page.locator('.smart-search input')
  await expect(page.locator('.search-roots')).toContainText('كتب')
  const count = await page.locator('.search-count').textContent()
  const refs = await page.locator('.search-result .ref').evaluateAll(links => links.slice(0, 5).map(link => link.getAttribute('href')))
  await input.fill('کِتاب')
  await expect(input).toHaveValue('کِتاب')
  await expect(page).toHaveURL(/q=%DA%A9/)
  await expect(page.locator('.search-count')).toHaveText(count!)
  await expect.poll(() => page.locator('.search-result .ref').evaluateAll(links => links.slice(0, 5).map(link => link.getAttribute('href')))).toEqual(refs)
  const before = await page.locator('.search-result').count()
  await page.getByRole('button', { name: language === 'fa' ? 'نمایش نتایج بیشتر' : 'Show more results', exact: true }).click()
  await expect(page.locator('.search-result')).toHaveCount(before + 60)
})

test('spelling suggestions are explicit and a translation match shows the matching translation', async ({ page }) => {
  await setup(page)
  await page.goto('/#/search?q=mercu')
  await page.getByRole('button', { name: 'mercy', exact: true }).click()
  await expect(page.locator('.smart-search input')).toHaveValue('mercy')
  await expect(page.locator('.search-result').first().locator('.tr[lang="en"]')).toContainText(/mercy/i)
})

test('root search controls are accessible on a phone', async ({ page }) => {
  await setup(page, 'fa')
  await page.goto('/#/search?q=ضربتم')
  await expect(page.locator('.search-count')).toContainText('۵۴')
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.mushaf-host').analyze()
  expect(result.violations.map(item => `${item.id}: ${item.nodes.map(node => node.target.join(' ')).join(', ')}`)).toEqual([])
})

test('phone settings remain narrow and their controls remain reachable', async ({ page }) => {
  await setup(page, 'fa')
  await page.goto('/#/verse/10/37')
  await page.locator('.study-settings').click()
  const drawer = page.locator('.drawer')
  const box = (await drawer.boundingBox())!
  expect(box.width).toBeLessThanOrEqual(340)
  expect(box.width).toBeLessThan(390 - 30)
  for (const button of await drawer.locator('.segctl button, .stepper button').all()) {
    const bounds = (await button.boundingBox())!
    expect(bounds.width).toBeGreaterThanOrEqual(44)
    expect(bounds.height).toBeGreaterThanOrEqual(44)
  }
  expect(await drawer.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
})
