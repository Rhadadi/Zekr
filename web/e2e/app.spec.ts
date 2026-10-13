import { expect, test, type Page } from '@playwright/test'
import { ayahForSlot } from '../src/rotation'

// Never touch the network for audio. Record every file the player is asked to play
// (media requests are not reliably visible to request interception).
async function trackAudio(page: Page): Promise<() => Promise<string[]>> {
  await page.route('**/everyayah.com/**', (route) => route.abort())
  await page.addInitScript(() => {
    const w = window as unknown as { __played: string[]; __audio: HTMLMediaElement[] }
    w.__played = []
    w.__audio = []
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      w.__played.push(this.src)
      if (!w.__audio.includes(this)) w.__audio.push(this)
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
    await page.goto('/#/today')
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

  test('Quran text uses KFGQPC Hafs by default, and another font can be picked in Settings', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    const arFont = () => page.locator('article#a-24 .ar').evaluate((e) => getComputedStyle(e).fontFamily)
    const loaded = (family: string) => page.evaluate(async (f) => {
      await document.fonts.ready
      return [...document.fonts].some((x) => x.family.replace(/"/g, '') === f && x.status === 'loaded')
    }, family)
    await page.goto('/#/ayah/17/24')
    await expect.poll(arFont).toMatch(/^"?Zekr Hafs/)
    await expect.poll(() => loaded('Zekr Hafs')).toBe(true)

    await page.goto('/#/settings')
    await page.getByLabel('Quran font').selectOption({ label: 'Me-Quran' })
    await expect(page.locator('.sample .ar')).toHaveCSS('font-family', /^"?Zekr Me Quran/)
    await page.goto('/#/ayah/17/24')
    await expect.poll(arFont).toMatch(/^"?Zekr Me Quran/)
    await expect.poll(() => loaded('Zekr Me Quran')).toBe(true)
    await page.reload()
    await expect.poll(arFont).toMatch(/^"?Zekr Me Quran/)
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
    await page.locator('article#a-24').getByRole('button', { name: 'More' }).click()
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
  for (const path of ['#/', '#/today', '#/index', '#/surah/1', '#/daily', '#/search', '#/saved', '#/settings', '#/about']) {
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
  await page.goto('/#/today')
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

// Pretend the current recording finished, as the browser would at the end of the file.
async function finishRecording(page: Page) {
  await page.evaluate(() => (window as unknown as { __audio: HTMLMediaElement[] }).__audio[0]!.dispatchEvent(new Event('ended')))
}

test.describe('what plays, and seeing it', () => {
  test('the play button on the ayah of the day plays only that ayah', async ({ page }) => {
    const played = await trackAudio(page)
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/today')
    await page.getByTestId('daily-card').getByRole('button', { name: 'Play this ayah' }).click()
    await expect.poll(async () => (await played()).length).toBe(1)
    await finishRecording(page)
    await page.waitForTimeout(300)
    expect(await played()).toHaveLength(1)
  })

  test('in the reader, playback goes on to the next ayah and highlights it', async ({ page }) => {
    const played = await trackAudio(page)
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/ayah/17/24')
    await page.locator('article#a-24').getByRole('button', { name: 'Play' }).click()
    await expect.poll(async () => (await played()).length).toBe(1)
    await finishRecording(page)
    await expect.poll(async () => (await played()).at(-1)).toBe('https://everyayah.com/data/Minshawy_Murattal_128kbps/017025.mp3')
    await expect(page.locator('article#a-25')).toHaveClass(/playing/)
    await expect(page.locator('.player')).toContainText('17:25')
  })

  test('the player bar takes you to the ayah being recited', async ({ page }) => {
    await trackAudio(page)
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/today')
    await page.getByTestId('daily-card').getByRole('button', { name: 'Play this ayah' }).click()
    const id = await page.getByTestId('daily-card').getAttribute('data-ayah-id')
    await page.getByRole('link', { name: /Go to the ayah being recited/ }).click()
    await expect(page).toHaveURL(/#\/ayah\/\d+\/\d+$/)
    await expect(page.locator(`article[data-id="${id}"]`)).toHaveClass(/playing|focused/)
  })

  test('home shows only the ayah of the day and where you left off', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/today')
    await expect(page.getByTestId('daily-card')).toBeVisible()
    await expect(page.locator('.continue-row')).toContainText('Start with Al-Fatiha')
    await expect(page.locator('main .tile')).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText('Changes in')
  })

  test('ayah actions are tucked behind More', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/surah/1')
    const first = page.locator('article#a-1')
    await expect(first.getByRole('button', { name: 'Copy' })).toHaveCount(0)
    await first.getByRole('button', { name: 'More' }).click()
    await expect(first.getByRole('button', { name: 'Copy' })).toBeVisible()
    await expect(first.getByRole('button', { name: 'Share' })).toBeVisible()
  })
})

test.describe('translation audio after each ayah', () => {
  test('one tap in the reader turns it on: Persian reads Fooladvand after each ayah, then moves on', async ({ page }) => {
    const played = await trackAudio(page)
    await useSettings(page, { lang: 'fa' })
    await page.goto('/#/surah/17')
    const chip = page.getByRole('button', { name: /ترجمهٔ گویا/ })
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await expect(chip).toContainText('فولادوند')
    await page.goto('/#/ayah/17/24')
    await page.locator('article#a-24').getByRole('button', { name: 'پخش' }).click()
    await expect.poll(async () => (await played()).at(-1)).toBe('https://everyayah.com/data/Minshawy_Murattal_128kbps/017024.mp3')
    await finishRecording(page)
    await expect.poll(async () => (await played()).at(-1)).toBe('https://everyayah.com/data/translations/Fooladvand_Hedayatfar_40Kbps/017024.mp3')
    await finishRecording(page)
    await expect.poll(async () => (await played()).at(-1)).toBe('https://everyayah.com/data/Minshawy_Murattal_128kbps/017025.mp3')
  })

  test('English reads Saheeh International, and the player bar switch turns it off again', async ({ page }) => {
    const played = await trackAudio(page)
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/surah/112')
    await page.getByRole('button', { name: /Translation audio/ }).click()
    await expect(page.getByRole('button', { name: /Translation audio/ }).first()).toContainText('Saheeh')
    await page.locator('article#a-1').getByRole('button', { name: 'Play' }).click()
    await finishRecording(page)
    await expect.poll(async () => (await played()).at(-1)).toBe('https://everyayah.com/data/English/Sahih_Intnl_Ibrahim_Walk_192kbps/112001.mp3')
    const barSwitch = page.locator('.player').getByRole('button', { name: 'Translation audio' })
    await expect(barSwitch).toHaveAttribute('aria-pressed', 'true')
    await barSwitch.click()
    await expect(barSwitch).toHaveAttribute('aria-pressed', 'false')
    await finishRecording(page)
    await expect.poll(async () => (await played()).at(-1)).toBe('https://everyayah.com/data/Minshawy_Murattal_128kbps/112002.mp3')
    // switching it back on brings back the same recording
    await barSwitch.click()
    await expect(page.locator('.chip')).toContainText('Saheeh')
  })

  test('the player bar fits on a phone screen', async ({ page }) => {
    await trackAudio(page)
    await useSettings(page, { lang: 'fa' })
    await page.goto('/#/surah/1')
    await page.locator('article#a-1').getByRole('button', { name: 'پخش' }).click()
    await expect(page.locator('.player')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const box = await page.locator('.player').boundingBox()
    expect(box!.width).toBeLessThanOrEqual(390)
  })
})

test('changing a setting while reciting does not stop playback', async ({ page }) => {
  const played = await trackAudio(page)
  await useSettings(page, { lang: 'en' })
  await page.goto('/#/surah/112')
  await page.locator('article#a-1').getByRole('button', { name: 'Play' }).click()
  await page.locator('.player').getByRole('button', { name: 'Recitation' }).click()
  await page.getByRole('dialog').getByLabel('Speed').selectOption('1.25')
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()
  await finishRecording(page)
  await expect.poll(async () => (await played()).at(-1)).toBe('https://everyayah.com/data/Minshawy_Murattal_128kbps/112002.mp3')
  await finishRecording(page)
  await expect.poll(async () => (await played()).at(-1)).toBe('https://everyayah.com/data/Minshawy_Murattal_128kbps/112003.mp3')
})

test.describe('Al-Mizan tafsir', () => {
  test('the public build has no tafsir button', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/verse/19/7')
    await page.locator('article#a-7').getByRole('button', { name: 'More' }).click()
    await expect(page.locator('article#a-7').getByRole('button', { name: 'Copy' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Tafsir/ })).toHaveCount(0)
  })

  test.describe('in a private build', () => {
    // A made-up section in the format tools/almizan.py writes; the real text is never in the public build.
    test.use({ serviceWorkers: 'block' })
    test.beforeEach(async ({ page }) => {
      await page.route('**/data/meta.json*', async (route) => {
        const response = await route.fetch()
        route.fulfill({ response, json: { ...(await response.json()), tafsir: ['almizan'] } })
      })
      await page.route('**/data/almizan/index.json*', (route) =>
        route.fulfill({ json: { source: 'test', sections: [['19_1-15', 1, 6236]] } }))
      await page.route('**/data/almizan/19_1-15.json*', (route) =>
        route.fulfill({
          json: {
            id: '19_1-15', surah: 19, from: 1, to: 15, title: 'سوره مریم آیه‌های ۱ تا ۱۵',
            blocks: [
              { t: 'h', r: [['ترجمه آیات']] },
              { t: 'p', r: [['ترجمهٔ آزمایشی']] },
              { t: 'h', r: [['بحث روایتی']] },
              { t: 't', r: [['موضوع '], ['کهیعص', 'q']] },
              { t: 'p', r: [['در حدیث '], ['متن حدیث', 'd'], [1, 'n'], [' آمده است.']] },
            ],
            notes: ['مجمع البیان، ج ۶'],
          },
        }))
    })

    test('an ayah links to the Al-Mizan section that explains it', async ({ page }) => {
      await useSettings(page, { lang: 'en' })
      await page.goto('/#/verse/19/7')
      await page.locator('article#a-7').getByRole('button', { name: 'More' }).click()
      await page.locator('article#a-7').getByRole('link', { name: 'Tafsir: Al-Mizan' }).click()
      await expect(page).toHaveURL(/#\/tafsir\/19\/7$/)
      const article = page.locator('article.tafsir')
      await expect(article.getByRole('heading', { name: 'سوره مریم آیه‌های ۱ تا ۱۵' })).toBeVisible()
      await expect(article.getByRole('heading', { name: 'بحث روایتی', level: 3 })).toBeVisible()
      await expect(article.locator('.tf-q')).toHaveText('کهیعص')
      await expect(article.locator('.tf-d')).toHaveText('متن حدیث')
      await expect(article.locator('sup.fn')).toHaveText('۱')
      await expect(article.locator('.tf-notes li')).toHaveText('مجمع البیان، ج ۶')
      await expect(article.getByRole('navigation', { name: 'Parts' }).getByRole('link')).toHaveCount(2)
    })

    test('the mushaf page panel links to it too', async ({ page }) => {
      await useSettings(page, { lang: 'fa' })
      await page.goto('/#/page/305')
      await page.locator('.ay').nth(2).click()
      await page.getByTestId('ayah-sheet').getByRole('link', { name: 'تفسیر: المیزان' }).click()
      await expect(page).toHaveURL(/#\/tafsir\/19\/3$/)
      await expect(page.locator('article.tafsir .tf-h').first()).toHaveText('ترجمه آیات')
    })
  })
})

test.describe('opening the app', () => {
  test('shows the Quran, not the ayah of the day: Al-Fatiha the first time', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/')
    await expect(page.locator('article#a-1')).toBeVisible()
    await expect(page.getByTestId('daily-card')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Quran' })).toHaveAttribute('aria-current', 'page')
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' }).click()
    await expect(page.getByTestId('daily-card')).toBeVisible()
  })

  test('then where you left off, in the page view if that is your reading view', async ({ page }) => {
    await useSettings(page, { lang: 'en', readMode: 'page' })
    await page.addInitScript(() => localStorage.setItem('zekr.lastRead', JSON.stringify({ surah: 19, ayah: 5 })))
    await page.goto('/')
    await expect(page.locator('.mushaf-page')).toHaveAttribute('data-page', '305')
  })
})

test.describe('page view: tapping and pressing', () => {
  test('the open ayah panel follows the recitation, with one highlight', async ({ page }) => {
    const played = await trackAudio(page)
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/305')
    await page.locator('.ay').first().click()
    const sheet = page.getByTestId('ayah-sheet')
    await expect(sheet).toContainText('19:1')
    await sheet.getByRole('button', { name: 'Play' }).click()
    await expect.poll(async () => (await played()).length).toBe(1)
    await finishRecording(page)
    await expect(sheet).toContainText('19:2')
    await expect(sheet.locator('.tr')).toContainText('زکری')
    await expect(page.locator('.ay.sel')).toHaveCount(1)
    await expect(page.locator('.ay.sel')).toHaveAttribute('data-id', String(await page.locator('.ay').nth(1).getAttribute('data-id')))
    await expect(page.locator('.ay.playing')).toHaveCount(0)
  })

  test('tapping the page opens reading options; a long press on an ayah opens its panel, not the browser menu', async ({ page }) => {
    await useSettings(page, { lang: 'en', translations: ['en.sahih'] })
    await page.goto('/#/page/305')
    await expect(page.locator('.mushaf-page')).toHaveCSS('user-select', 'none')
    await page.locator('.banner').click()
    const options = page.getByTestId('page-options')
    await expect(options).toContainText('Page 305')
    await options.getByLabel('Quran font').selectOption({ label: 'Amiri Quran' })
    await expect(page.locator('.flow').first()).toHaveCSS('font-family', /^"?Zekr Amiri/)
    await page.locator('.banner').click()
    await expect(options).toHaveCount(0)

    await page.locator('.ay').nth(2).dispatchEvent('contextmenu')
    await expect(page.getByTestId('ayah-sheet')).toContainText('19:3')
  })
})
