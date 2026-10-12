import { expect, test, type Page } from '@playwright/test'
import { ayahForSlot } from '../src/rotation'

// Never touch the network for audio. Record every file the player is asked to play
// (media requests are not reliably visible to request interception).
async function trackAudio(page: Page): Promise<() => Promise<string[]>> {
  await page.route('**/everyayah.com/**', (route) => route.abort())
  await page.addInitScript(() => {
    const w = window as unknown as { __played: string[] }
    w.__played = []
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      w.__played.push(this.src)
      return play.call(this)
    }
  })
  return () => page.evaluate(() => (window as unknown as { __played: string[] }).__played)
}

async function useSettings(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript((s) => {
    if (!localStorage.getItem('zekr.settings')) localStorage.setItem('zekr.settings', JSON.stringify(s))
  }, settings)
}

test.describe('ayah of the day', () => {
  test('home shows the ayah the shared rule picks for the current day', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2025-10-12T12:00:00Z'))
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/')
    const card = page.getByTestId('daily-card')
    await expect(card).toBeVisible()
    const all = Array.from({ length: 6236 }, (_, i) => i + 1)
    const slot = Math.floor(1760270400 / 86400) // UTC, daily
    await expect(card).toHaveAttribute('data-ayah-id', String(ayahForSlot(all, slot)))
  })

  test('hourly setting changes the ayah when the hour changes', async ({ page }) => {
    await useSettings(page, { lang: 'en', daily: { period: 3600, pool: 'all', show: 'en', fa: 'fa.safavi', en: 'en.sahih', salt: 0 } })
    await page.clock.setFixedTime(new Date('2025-10-12T12:00:00Z'))
    await page.goto('/#/daily')
    const first = await page.getByTestId('daily-card').getAttribute('data-ayah-id')
    await page.clock.setFixedTime(new Date('2025-10-12T13:05:00Z'))
    await page.reload()
    const second = await page.getByTestId('daily-card').getAttribute('data-ayah-id')
    expect(second).not.toBe(first)
    const all = Array.from({ length: 6236 }, (_, i) => i + 1)
    expect(second).toBe(String(ayahForSlot(all, Math.floor(1760274300 / 3600))))
  })

  test('daily page lists upcoming ayahs and a widget preview', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/daily')
    await expect(page.getByTestId('widget-preview')).toBeVisible()
    await expect(page.locator('ul.list li')).toHaveCount(7)
  })
})

test.describe('reader', () => {
  test('opens at an ayah with the Safavi translation by default', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/ayah/17/24')
    const ayah = page.locator('article#a-24')
    await expect(ayah).toBeVisible()
    await expect(ayah.locator('.ar')).toContainText('جَنَاحَ')
    await expect(ayah.locator('.tr')).toContainText('بال فروتنی را برای آن دو بگستر')
    await expect(page.locator('article.ayah')).toHaveCount(111)
    await expect(page.locator('.basmala')).toBeVisible()
  })

  test('surah 9 has no basmala and Al-Fatiha shows it as ayah 1', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/surah/9')
    await expect(page.locator('article.ayah')).toHaveCount(129)
    await expect(page.locator('.basmala')).toHaveCount(0)
    await page.goto('/#/surah/1')
    await expect(page.locator('article.ayah')).toHaveCount(7)
    await expect(page.locator('.basmala')).toHaveCount(0)
    await expect(page.locator('article#a-1 .ar')).toContainText('بِسْمِ')
  })

  test('first ayah of a surah does not repeat the basmala', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/surah/2')
    await expect(page.locator('article#a-1 .ar')).not.toContainText('بِسْمِ')
    await expect(page.locator('article#a-1 .tr')).toContainText('الف. لام. میم')
  })

  test('shows a placeholder where Safavi merged two ayahs (80:39)', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/ayah/80/39')
    await expect(page.locator('article#a-39 .tr.merged')).toContainText('previous ayah')
  })

  test('another translation can be added in Settings', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/settings')
    await page.getByRole('checkbox', { name: /Saheeh International/ }).check()
    await page.goto('/#/ayah/17/24')
    await expect(page.locator('article#a-24')).toContainText('have mercy upon them as they brought me up')
    await expect(page.locator('article#a-24')).toContainText('بال فروتنی')
  })

  test('play button asks for the reciter\'s file for that ayah', async ({ page }) => {
    const played = await trackAudio(page)
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/ayah/17/24')
    await page.locator('article#a-24').getByRole('button', { name: 'Play' }).click()
    await expect(page.locator('.player')).toContainText('17:24')
    expect((await played())[0]).toBe('https://everyayah.com/data/Minshawy_Murattal_128kbps/017024.mp3')
  })

  test('playing a whole surah starts with the basmala recording', async ({ page }) => {
    const played = await trackAudio(page)
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/surah/112')
    await page.getByRole('button', { name: 'Play surah' }).click()
    await expect.poll(async () => (await played())[0]).toBe('https://everyayah.com/data/Minshawy_Murattal_128kbps/001001.mp3')
  })
})

test.describe('search, saved, settings', () => {
  test('search finds Arabic regardless of diacritics and highlights matches', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/search')
    await page.getByRole('searchbox').fill('الرحمن الرحيم')
    await expect(page.locator('article.ayah').first()).toBeVisible()
    await expect(page.locator('mark').first()).toBeVisible()
    await expect(page.locator('article.ayah').first().locator('a.ref')).toContainText('1:1')
  })

  test('search matches Persian written with Arabic letters', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/search?q=' + encodeURIComponent('بال فروتني'))
    await expect(page.locator('article.ayah a.ref').first()).toBeVisible()
    await expect(page.locator('article.ayah a.ref', { hasText: '17:24' })).toBeVisible()
  })

  test('saving an ayah keeps it after a reload', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/ayah/17/24')
    await page.locator('article#a-24').getByRole('button', { name: 'Save ayah' }).click()
    await page.goto('/#/saved')
    await page.reload()
    await expect(page.locator('article.ayah a.ref')).toContainText('17:24')
  })

  test('Persian UI is right-to-left with Persian digits', async ({ page }) => {
    await useSettings(page, { lang: 'fa' })
    await page.goto('/#/index')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.locator('ul.list .badge').first()).toHaveText('۱')
    await expect(page.locator('ul.list').first()).toContainText('فاتحه')
  })

  test('English UI is left-to-right', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/index')
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
    await expect(page.locator('ul.list .badge').first()).toHaveText('1')
  })

  test('surah filter narrows the index', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/index')
    await page.getByRole('searchbox').fill('isra')
    await expect(page.locator('ul.list li')).toHaveCount(1)
    await page.locator('ul.list li a').click()
    await expect(page).toHaveURL(/#\/surah\/17$/)
  })
})

test.describe('layout', () => {
  for (const path of ['#/', '#/index', '#/surah/1', '#/daily', '#/search', '#/saved', '#/settings', '#/about']) {
    test(`no sideways scrolling at phone width: ${path}`, async ({ page }) => {
      await useSettings(page, { lang: 'fa' })
      await page.goto('/' + path)
      await page.waitForTimeout(400)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(0)
    })
  }
})

test('works offline after the first visit', async ({ page, context }) => {
  await useSettings(page, { lang: 'en' })
  await page.goto('/#/')
  await expect(page.getByTestId('daily-card')).toBeVisible()
  // wait until the service worker has installed and precached the data
  await expect
    .poll(async () => page.evaluate(async () => {
      const keys = await caches.keys()
      const pre = keys.find((k) => k.includes('precache'))
      return pre ? (await (await caches.open(pre)).keys()).length : 0
    }), { timeout: 20_000 })
    .toBeGreaterThan(20)
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByTestId('daily-card')).toBeVisible()
  await page.goto('/#/ayah/1/2')
  await expect(page.locator('article#a-2 .tr')).toContainText('ستایش')
})

test.describe('mushaf page view', () => {
  test('page 305 matches the printed mushaf: Maryam 1-11, juz 16', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/305')
    await expect(page.locator('.banner')).toContainText('سورة مريم')
    await expect(page.locator('.basmala')).toBeVisible()
    await expect(page.locator('.ay')).toHaveCount(11)
    await expect(page.locator('.ay').first()).toContainText(/هيع/) // the letters, whatever marks the script puts on them
    await expect(page.locator('.mark').first()).toHaveText('﴿١﴾')
    await expect(page.locator('.mark').last()).toHaveText('﴿١١﴾')
    await expect(page.locator('.mb-page')).toHaveText('305')
    await expect(page.locator('.mb-juz')).toHaveText('Juz 16')
    await expect(page.locator('.mb-surah')).toContainText('مريم')
  })

  test('tapping an ayah shows its translation and actions', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/305')
    await page.locator('.ay').nth(1).click()
    const sheet = page.getByTestId('ayah-sheet')
    await expect(sheet).toContainText('19:2')
    await expect(sheet).toContainText('رحمت بخشی پروردگارت')
    await expect(page.locator('.ay.sel')).toHaveCount(1)
    await sheet.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByTestId('ayah-sheet')).toHaveCount(0)
  })

  test('next and previous page buttons turn the page', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/305')
    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(page).toHaveURL(/#\/page\/306$/)
    await expect(page.locator('.ay').first().locator('.mark')).toHaveText('﴿١٢﴾')
    await page.getByRole('button', { name: 'Previous page' }).click()
    await expect(page).toHaveURL(/#\/page\/305$/)
  })

  test('a page that starts mid-surah has no banner, and the first page opens Al-Fatiha', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/306')
    await expect(page.locator('.ay').first()).toBeVisible()
    await expect(page.locator('.banner')).toHaveCount(0)
    await page.goto('/#/page/1')
    await expect(page.locator('.banner')).toContainText('الفاتحة')
    await expect(page.locator('.basmala')).toHaveCount(0)
    await expect(page.locator('.ay')).toHaveCount(7)
  })

  test('jump to a page by number', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/305')
    await page.locator('.mb-page').click()
    await page.getByLabel('Go to page').fill('284')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#\/page\/284$/)
    await expect(page.locator('.mb-surah')).toContainText('الإسراء')
  })

  test('the reading mode setting decides how surah links open, and the toggle switches', async ({ page }) => {
    await useSettings(page, { lang: 'en', readMode: 'page' })
    await page.goto('/#/ayah/17/24')
    await expect(page.locator('.mushaf-page')).toHaveAttribute('data-page', '284')
    await expect(page.locator('.ay.sel')).toHaveCount(1)
    await page.getByRole('button', { name: 'Verses' }).click()
    await expect(page).toHaveURL(/#\/verse\/17\/24$/)
    await expect(page.locator('article#a-24')).toBeVisible()
    await page.getByRole('button', { name: 'Page' }).click()
    await expect(page).toHaveURL(/#\/page\/284$/)
  })

  test('verse links always open verse by verse', async ({ page }) => {
    await useSettings(page, { lang: 'en', readMode: 'page' })
    await page.goto('/#/verse/1')
    await expect(page.locator('article.ayah')).toHaveCount(7)
  })

  test('swiping right turns to the next page (right-to-left book)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })
    const page = await context.newPage()
    await page.addInitScript(() => localStorage.setItem('zekr.settings', JSON.stringify({ lang: 'en' })))
    await page.goto('http://localhost:4173/#/page/305')
    await expect(page.locator('.ay').first()).toBeVisible()
    const swipe = (fromX: number, toX: number) =>
      page.evaluate(([a, b]) => {
        const el = document.querySelector('.mushaf-page')!
        const mk = (type: string, x: number) =>
          new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 })], changedTouches: [new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 })] })
        el.dispatchEvent(mk('touchstart', a as number))
        el.dispatchEvent(mk('touchend', b as number))
      }, [fromX, toX])
    await swipe(100, 260)
    await expect(page).toHaveURL(/#\/page\/306$/)
    await swipe(260, 100)
    await expect(page).toHaveURL(/#\/page\/305$/)
    await context.close()
  })
})
