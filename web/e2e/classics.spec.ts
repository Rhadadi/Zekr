import { expect, test, type Page } from '@playwright/test'
import { gzipSync } from 'node:zlib'

// The classical tafsirs (src/classics.ts). CI's data has none, so this serves two made-up books: 'demo' (Arabic) on
// 1:1–1:3 (1:2 and 1:3 share the text of 1:2), and 'demo-en' (English) on 1:1 only.
const index = {
  source: 'made-up test data',
  books: [
    { id: 'demo', lang: 'ar', name: { en: 'Made-up commentary', fa: 'تفسیر ساختگی' }, author: { en: 'A made-up author', fa: 'نویسندهٔ ساختگی' }, chunks: { '1': [1] } },
    { id: 'demo-en', lang: 'en', name: { en: 'Made-up English notes', fa: 'یادداشت‌های انگلیسی' }, author: { en: 'Another one', fa: 'دیگری' }, chunks: { '1': [1] } },
  ],
}
const chunks: Record<string, Record<string, string | number>> = {
  demo: { '1': 'نص ساختگي للآية الأولى.\nفقرة ثانية.', '2': 'نص ساختگي للآيتين معا.', '3': 2 },
  'demo-en': { '1': 'Made-up note on the first ayah.' },
}

async function serveClassics(page: Page) {
  await page.route('**/data/meta.json*', async (route) => {
    const res = await route.fetch()
    await route.fulfill({ response: res, json: { ...(await res.json()), classics: ['demo', 'demo-en'] } })
  })
  await page.route('**/data/classics/index.json*', (route) => route.fulfill({ json: index }))
  // served as GitHub Pages does: a plain .gz file, which the page unpacks itself
  await page.route('**/data/classics/*/*.json.gz*', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2)!
    return route.fulfill({ body: gzipSync(JSON.stringify(chunks[id])), contentType: 'application/gzip' })
  })
}

test.describe('classical tafsirs (made-up books)', () => {
  test('an ayah has a tab for each book that has something on its surah, and the text, in its own direction', async ({ page }) => {
    await serveClassics(page)
    await page.addInitScript(() => { localStorage.setItem('zekr.settings', JSON.stringify({ lang: 'en' })); localStorage.setItem('zekr.inlineDefault', 'true') })
    await page.goto('/#/classic/1/1')
    const tabs = page.getByRole('tab')
    await expect(tabs).toHaveText(['Made-up commentary', 'Made-up English notes'])
    await expect(page.getByRole('tab', { name: 'Made-up commentary' })).toHaveAttribute('aria-selected', 'true')
    const panel = page.getByRole('tabpanel')
    await expect(panel).toContainText('نص ساختگي للآية الأولى.')
    await expect(panel.locator('p.tf-p')).toHaveCount(2) // a line break in the book is a paragraph
    await expect(panel).toHaveAttribute('dir', 'rtl')
    await page.getByRole('tab', { name: 'Made-up English notes' }).click()
    await expect(page.getByRole('tabpanel')).toContainText('Made-up note on the first ayah.')
    await expect(page.getByRole('tabpanel')).toHaveAttribute('dir', 'ltr')
    // the choice of book is kept for the next ayah
    await page.goto('/#/classic/1/2')
    await expect(page.getByRole('tab', { name: 'Made-up English notes' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tabpanel')).toContainText('This book has nothing on this ayah.')
  })

  test('ayahs the author discusses together show the same text, and a book that is not served says so', async ({ page }) => {
    await serveClassics(page)
    await page.addInitScript(() => { localStorage.setItem('zekr.settings', JSON.stringify({ lang: 'fa' })); localStorage.setItem('zekr.classicBook', 'demo') })
    await page.goto('/#/classic/1/3')
    await expect(page.getByRole('tabpanel')).toContainText('نص ساختگي للآيتين معا.')
    await expect(page.getByRole('tab', { name: 'تفسیر ساختگی' })).toBeVisible() // names in the app's language
  })

  test('without the data the page says that this version does not have them', async ({ page }) => {
    await page.route('**/data/meta.json*', async (route) => {
      const res = await route.fetch()
      const { classics: _, ...meta } = await res.json()
      await route.fulfill({ response: res, json: meta })
    })
    await page.addInitScript(() => localStorage.setItem('zekr.settings', JSON.stringify({ lang: 'en' })))
    await page.goto('/#/classic/1/1')
    await expect(page.getByText('This version of the site does not include the classical tafsirs.')).toBeVisible()
  })

  test('the ayah panel links to them', async ({ page }) => {
    await serveClassics(page)
    await page.addInitScript(() => { localStorage.setItem('zekr.settings', JSON.stringify({ lang: 'en', translationPlace: 'panel' })); localStorage.setItem('zekr.inlineDefault', 'true') })
    await page.goto('/#/page/1')
    await page.locator('#page-1 .ay').nth(2).click()
    const panel = page.getByTestId('ayah-panel')
    await panel.getByRole('button', { name: 'More', exact: true }).click()
    await expect(panel.getByRole('link', { name: 'Classical tafsirs' })).toHaveAttribute('href', '#/classic/1/3')
  })
})
