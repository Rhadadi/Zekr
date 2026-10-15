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

// The page view holds the page or ayah it opened at in place for a moment while the text settles (heights of pages
// not yet laid out are estimates). Wait until the text is there and the scroll position has stopped moving, then do
// what a reader does first, scroll a little, which ends that holding for good.
// The burger of the bar that is on top (a layer has its own bar over the mushaf's).
const menu = (page: Page) => page.getByRole('button', { name: 'Menu' }).last()

async function settle(page: Page) {
  await expect(page.locator('.mpage .ay').first()).toBeAttached()
  let last = -1
  let still = 0
  for (let i = 0; i < 100 && still < 8; i++) {
    await page.waitForTimeout(100)
    const y = await page.evaluate(() => scrollY)
    still = y === last ? still + 1 : 0
    last = y
  }
  await page.mouse.wheel(0, 1)
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
    await page.goto('/#/verse/17/24')
    const ayah = page.locator('article#a-24')
    await expect(ayah).toBeVisible()
    await expect(ayah.locator('.ar')).toContainText('جَنَاحَ')
    await expect(ayah.locator('.tr')).toContainText('بال فروتنی را برای آن دو بگستر')
    await expect(page.locator('article.ayah')).toHaveCount(111)
    await expect(page.locator('.layer .basmala')).toBeVisible()
  })

  test('surah 9 has no basmala and Al-Fatiha shows it as ayah 1', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/verse/9')
    await expect(page.locator('article.ayah')).toHaveCount(129)
    await expect(page.locator('.layer .basmala')).toHaveCount(0)
    await page.goto('/#/verse/1')
    await expect(page.locator('article.ayah')).toHaveCount(7)
    await expect(page.locator('.layer .basmala')).toHaveCount(0)
    await expect(page.locator('article#a-1 .ar')).toContainText('بِسْمِ')
  })

  test('first ayah of a surah does not repeat the basmala', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/verse/2')
    await expect(page.locator('article#a-1 .ar')).not.toContainText('بِسْمِ')
    await expect(page.locator('article#a-1 .tr')).toContainText('الف. لام. میم')
  })

  test('shows a placeholder where Safavi merged two ayahs (80:39)', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/verse/80/39')
    await expect(page.locator('article#a-39 .tr.merged')).toContainText('previous ayah')
  })

  test('another translation can be added in Settings', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/settings')
    await page.getByRole('checkbox', { name: /Saheeh International/ }).check()
    await page.goto('/#/verse/17/24')
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
    await page.goto('/#/verse/17/24')
    await expect.poll(arFont).toMatch(/^"?Zekr Hafs/)
    await expect.poll(() => loaded('Zekr Hafs')).toBe(true)

    await page.goto('/#/settings')
    await page.getByLabel('Quran font').selectOption({ label: 'Me-Quran' })
    await expect(page.locator('.sample .ar')).toHaveCSS('font-family', /^"?Zekr Me Quran/)
    await page.goto('/#/verse/17/24')
    await expect.poll(arFont).toMatch(/^"?Zekr Me Quran/)
    await expect.poll(() => loaded('Zekr Me Quran')).toBe(true)
    await page.reload()
    await expect.poll(arFont).toMatch(/^"?Zekr Me Quran/)
  })

  test('play button asks for the reciter\'s file for that ayah', async ({ page }) => {
    const played = await trackAudio(page)
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/verse/17/24')
    await page.locator('article#a-24').getByRole('button', { name: 'Play' }).click()
    await expect(page.locator('.player')).toContainText('17:24')
    expect((await played())[0]).toBe('https://everyayah.com/data/Minshawy_Murattal_128kbps/017024.mp3')
  })

  test('playing a whole surah starts with the basmala recording', async ({ page }) => {
    const played = await trackAudio(page)
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/verse/112')
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
    await page.goto('/#/verse/17/24')
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
  await page.goto('/#/verse/1/2')
  await expect(page.locator('article#a-2 .tr')).toContainText('ستایش')
})

test.describe('mushaf page view', () => {
  test.use({ viewport: { width: 1280, height: 800 } }) // a computer: the box beside the text
  test('page 305 matches the printed mushaf: Maryam 1-11, juz 16', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/305')
    const p305 = page.locator('#page-305')
    await expect(p305.locator('.banner')).toContainText('سورة مريم')
    await expect(p305.locator('.basmala')).toBeVisible()
    await expect(p305.locator('.ay')).toHaveCount(11)
    await expect(p305.locator('.ay').first()).toContainText(/هيع/) // the letters, whatever marks the script puts on them
    await expect(p305.locator('.mark').first()).toHaveText('﴿١﴾')
    await expect(p305.locator('.mark').last()).toHaveText('﴿١١﴾')
    await expect(page.locator('.mb-page')).toHaveText('305')
    await expect(page.locator('.mb-juz')).toHaveText('Juz 16')
    await expect(page.locator('.mb-surah')).toContainText('مريم')
  })

  test('the pages flow on: scrolling down reaches the next page, and the header follows', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/305')
    await expect(page.locator('.mb-page')).toHaveText('305')
    await settle(page)
    await page.locator('#page-306').evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await expect(page.locator('.mb-page')).toHaveText('306')
    await expect(page.locator('#page-306 .ay').first().locator('.mark')).toHaveText('﴿١٢﴾')
    await expect(page.locator('#page-306 .banner')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Next page' })).toHaveCount(0)
  })

  test('the first page is Al-Fatiha, with no separate basmala', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/1')
    await expect(page.locator('#page-1 .banner')).toContainText('الفاتحة')
    await expect(page.locator('#page-1 .basmala')).toHaveCount(0)
    await expect(page.locator('#page-1 .ay')).toHaveCount(7)
  })

  test('jump to a page by number', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/305')
    await page.locator('.mb-page').click()
    await page.getByLabel('Go to page').fill('284')
    await page.keyboard.press('Enter')
    await expect(page.locator('.mb-page')).toHaveText('284')
    await expect(page.locator('.mb-surah')).toContainText('الإسراء')
    await expect(page.locator('#page-284 .ay').first()).toBeInViewport()
  })

  test('tapping an ayah opens the inspector beside the text, and the text does not move', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/305')
    await settle(page)
    const inspector = page.getByTestId('inspector')
    await expect(inspector).toContainText('Tap an ayah') // there from the start, so nothing shifts when it fills
    const flow = page.locator('#page-305 .flow').first()
    const before = (await flow.boundingBox())!
    const scrollBefore = await page.evaluate(() => scrollY)
    await page.locator('#page-305 .ay').nth(1).click()
    await expect(inspector.getByTestId('ayah-panel')).toContainText('19:2')
    await expect(inspector).toContainText('رحمت بخشی پروردگارت')
    await expect(page.locator('.ay.sel')).toHaveCount(1)
    const after = (await flow.boundingBox())!
    expect(after).toEqual(before)
    expect(await page.evaluate(() => scrollY)).toBe(scrollBefore)
    // at the start side (the left), in view, and not under the app bar
    const box = (await inspector.boundingBox())!
    expect(box.x + box.width).toBeLessThanOrEqual(after.x)
    expect(box.y).toBeGreaterThanOrEqual(52)
    await inspector.getByRole('button', { name: 'Close' }).click()
    await expect(inspector).toContainText('Tap an ayah')
    expect((await flow.boundingBox())!).toEqual(before)
  })

  test('in Persian the inspector is on the right, and stays in view while the page scrolls', async ({ page }) => {
    await useSettings(page, { lang: 'fa' })
    await page.goto('/#/page/305')
    await settle(page)
    await page.locator('#page-305 .ay').nth(1).click()
    const inspector = page.getByTestId('inspector')
    await expect(inspector.getByTestId('ayah-panel')).toBeVisible()
    const box = (await inspector.boundingBox())!
    const text = (await page.locator('#page-305 .flow').first().boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(text.x + text.width)
    await page.mouse.wheel(0, 900)
    await expect.poll(async () => (await inspector.boundingBox())!.y).toBeGreaterThanOrEqual(52)
    await expect(inspector).toBeInViewport()
  })

  test('with two translations the box shows both in full', async ({ page }) => {
    await useSettings(page, { lang: 'en', translations: ['fa.safavi', 'en.sahih'] })
    await page.goto('/#/page/3')
    await page.locator('#page-3 .ay').nth(1).click()
    const box = page.getByTestId('inspector')
    await expect(box.locator('.tr')).toHaveCount(2)
    await expect(box.locator('.tr').nth(1)).toBeVisible()
  })

  test('over the ayah: a mouse shows the translation on hover, a tap keeps it', async ({ page }) => {
    await useSettings(page, { lang: 'en', translationPlace: 'card' })
    await page.goto('/#/page/305')
    await settle(page)
    const ayah = page.locator('#page-305 .ay').nth(3)
    await ayah.hover()
    const pop = page.locator('.ayah-popup')
    await expect(pop).toContainText('19:4')
    const a = (await ayah.boundingBox())!
    const b = (await pop.boundingBox())!
    expect(Math.abs(b.y - (a.y + a.height))).toBeLessThan(80) // right by the ayah
    await expect(page.getByTestId('inspector')).toHaveCount(0)
    await page.locator('.mb-surah').hover()
    await expect(pop).toHaveCount(0)
    await ayah.click()
    await page.locator('.mb-surah').hover()
    await expect(pop).toContainText('19:4')
  })

  test('reading options open the Study view over the mushaf, and Close comes back to the same page', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/ayah/17/24')
    await expect(page.locator('.ay.sel')).toHaveCount(1)
    await expect(page.getByRole('group', { name: 'Reading view' })).toHaveCount(0)
    await page.locator('.mushaf-flow').dispatchEvent('click') // closes the ayah box
    await page.locator('.mushaf-flow').dispatchEvent('click') // opens the reading options
    await page.getByTestId('page-options').getByRole('button', { name: 'Open in Study view' }).click()
    await expect(page).toHaveURL(/#\/verse\/17\/\d+$/)
    await expect(page.locator('.layer article.ayah').first()).toBeVisible()
    await page.locator('.layer-close').click()
    await expect(page.locator('.layer')).toHaveCount(0)
    await expect(page.locator('.mb-page')).toHaveText('284')
  })

  test('verse links open the Study view as a layer over the mushaf', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/verse/1')
    await expect(page.locator('.layer article.ayah')).toHaveCount(7)
    await expect(page.locator('#page-1')).toBeAttached() // the mushaf is still there underneath
  })
})

test.describe('layers over the mushaf', () => {
  test('a layer keeps the mushaf exactly where it was, and Close brings you back to it', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/305')
    await expect(page.locator('#page-305 .ay').first()).toBeVisible()
    await page.mouse.wheel(0, 4) // a reader's own scroll ends the view's holding of page 305 in place while the text settles
    await page.locator('#page-320').evaluate((el) => el.scrollIntoView({ block: 'start' }))
    await expect(page.locator('.mb-page')).toHaveText('320')
    // where page 320 sits on the screen (the scroll offset itself moves when pages near the screen are laid out)
    const top = () => page.locator('#page-320').evaluate((el) => el.getBoundingClientRect().top)
    const before = await top()
    await menu(page).click()
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click()
    await expect(page.locator('.layer')).toBeVisible()
    await expect(page.locator('.mushaf-host')).toHaveAttribute('inert', '')
    await page.locator('.layer-close').click()
    await expect(page.locator('.layer')).toHaveCount(0)
    expect(Math.abs((await top()) - before)).toBeLessThan(2)
    await expect(page).toHaveURL(/#\/page\/305$/)
    await expect(page.locator('.mb-page')).toHaveText('320')
  })

  test('Back and Escape close a layer too', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/305')
    await expect(page.locator('#page-305 .ay').first()).toBeVisible()
    await menu(page).click()
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Saved' }).click()
    await expect(page.locator('.layer')).toBeVisible()
    await expect(page).toHaveURL(/#\/saved$/)
    await page.goBack()
    await expect(page).toHaveURL(/#\/page\/305$/)
    await expect(page.locator('.layer')).toHaveCount(0)
    await page.goForward()
    await expect(page).toHaveURL(/#\/saved$/)
    await expect(page.locator('.layer')).toBeFocused() // focus and the Escape listener are set up together
    await page.keyboard.press('Escape')
    await expect(page.locator('.layer')).toHaveCount(0)
    await expect(page).toHaveURL(/#\/page\/305$/)
  })

  test('the Study view stays a layer when it moves to the next surah, and Close still lands on the mushaf', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/305')
    await expect(page.locator('#page-305 .ay').first()).toBeVisible()
    await page.goto('/#/verse/19')
    await page.locator('.layer').getByRole('link', { name: /^20\./ }).click()
    await expect(page).toHaveURL(/#\/verse\/20$/)
    await expect(page.locator('.layer')).toBeVisible()
    await page.locator('.layer-close').click()
    await expect(page.locator('.layer')).toHaveCount(0)
  })

  test('nobody is stranded: a link straight into a layer still closes onto the mushaf', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/settings')
    await expect(page.locator('.layer')).toBeVisible()
    await page.getByRole('link', { name: 'About' }).click()
    await expect(page).toHaveURL(/#\/about$/)
    await page.locator('.layer-close').click()
    await expect(page.locator('.layer')).toHaveCount(0)
    await expect(page.locator('#page-1 .ay').first()).toBeVisible()
  })

  test('picking a search result closes the layer and selects that ayah in the mushaf', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/search?q=' + encodeURIComponent('بال فروتني'))
    await page.locator('article.ayah a.ref', { hasText: '17:24' }).click()
    await expect(page).toHaveURL(/#\/ayah\/17\/24$/)
    await expect(page.locator('.layer')).toHaveCount(0)
    await expect(page.locator('.ay.sel')).toHaveCount(1)
    await expect(page.locator('.mb-page')).toHaveText('284')
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
    await page.goto('/#/verse/17/24')
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
    await expect(page.locator('.layer')).toHaveCount(0) // the Today layer closed: the mushaf is under it, at that ayah
    await expect(page.locator(`.ay[data-id="${id}"]`)).toHaveClass(/playing|sel/)
  })

  test('home shows only the ayah of the day and where you left off', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/today')
    await expect(page.getByTestId('daily-card')).toBeVisible()
    await expect(page.locator('.continue-row')).toContainText('Start with Al-Fatiha') // nothing is written to "where you left off" while a layer hides the mushaf
    await expect(page.locator('main .tile')).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText('Changes in')
  })

  test('ayah actions are tucked behind More', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/verse/1')
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
    await page.goto('/#/verse/17')
    const chip = page.getByRole('button', { name: /ترجمهٔ گویا/ })
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await expect(chip).toContainText('فولادوند')
    await page.goto('/#/verse/17/24')
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
    await page.goto('/#/verse/112')
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
    await page.goto('/#/verse/1')
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
  await page.goto('/#/verse/112')
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
      await page.locator('#page-305 .ay').nth(2).click()
      await page.getByTestId('ayah-panel').getByRole('link', { name: 'تفسیر: المیزان' }).click()
      await expect(page).toHaveURL(/#\/tafsir\/19\/3$/)
      await expect(page.locator('article.tafsir .tf-h').first()).toHaveText('ترجمه آیات')
    })
  })
})

test.describe('opening the app', () => {
  test('shows the Quran, not the ayah of the day: Al-Fatiha the first time', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/')
    await expect(page.locator('#page-1 .ay').first()).toBeVisible()
    await expect(page.locator('.layer')).toHaveCount(0)
    await expect(page.getByTestId('daily-card')).toHaveCount(0)
    await menu(page).click()
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Quran' })).toHaveAttribute('aria-current', 'page')
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Today' }).click()
    await expect(page.getByTestId('daily-card')).toBeVisible()
  })

  test('then where you left off', async ({ page }) => {
    await useSettings(page, { lang: 'en', readMode: 'verse' }) // a retired setting: the Quran opens on the mushaf whatever it says
    await page.addInitScript(() => localStorage.setItem('zekr.lastRead', JSON.stringify({ surah: 19, ayah: 5 })))
    await page.goto('/')
    await expect(page.locator('.mb-page')).toHaveText('305')
  })
})

test.describe('page view: recitation, tapping and pressing', () => {
  test.use({ viewport: { width: 1280, height: 800 } }) // a computer: the box beside the text
  test('the open box follows the recitation, with one highlight', async ({ page }) => {
    const played = await trackAudio(page)
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/305')
    await page.locator('#page-305 .ay').first().click()
    const panel = page.getByTestId('ayah-panel')
    await expect(panel).toContainText('19:1')
    const flow = page.locator('#page-305 .flow').first()
    const wide = (await flow.boundingBox())!.width
    await panel.getByRole('button', { name: 'Play' }).click()
    await expect.poll(async () => (await played()).length).toBe(1)
    await finishRecording(page)
    await expect(panel).toContainText('19:2')
    expect((await flow.boundingBox())!.width).toBe(wide) // the inspector follows; the text never changes width
    await expect(panel.locator('.tr')).toContainText('زکری')
    await expect(page.locator('.ay.sel')).toHaveCount(1)
    await expect(page.locator('.ay.sel')).toHaveAttribute('data-id', String(await page.locator('#page-305 .ay').nth(1).getAttribute('data-id')))
    await expect(page.locator('.ay.playing')).toHaveCount(0)
  })

  test('repeat this ayah plays the same recording again and again until it is turned off', async ({ page }) => {
    const played = await trackAudio(page)
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/305')
    await settle(page)
    await page.locator('#page-305 .ay').first().click()
    const panel = page.getByTestId('ayah-panel')
    const repeat = panel.getByRole('button', { name: 'Repeat this ayah' })
    await expect(repeat).toHaveAttribute('aria-pressed', 'false')
    await repeat.click()
    await expect(repeat).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(async () => (await played()).length).toBe(1)
    for (let i = 2; i <= 4; i++) {
      await finishRecording(page)
      await expect.poll(async () => (await played()).length).toBe(i)
    }
    expect(new Set(await played()).size).toBe(1) // one recording, four times; it never moved on
    await expect(panel).toContainText('19:1')
    await repeat.click() // off: this recording finishes, then it carries on as planned
    await expect(repeat).toHaveAttribute('aria-pressed', 'false')
    expect((await played()).length).toBe(4) // and did not restart the recording mid-word
    await finishRecording(page)
    await expect(panel).toContainText('19:2')
  })

  test('the ayah being recited is highlighted and brought back into view, even after scrolling away', async ({ page }) => {
    const played = await trackAudio(page)
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/305')
    await page.locator('#page-305 .ay').first().click()
    await page.getByTestId('ayah-panel').getByRole('button', { name: 'Play' }).click()
    await page.getByTestId('inspector').getByRole('button', { name: 'Close' }).click()
    await expect.poll(async () => (await played()).length).toBe(1)
    await settle(page)
    await page.locator('#page-320').evaluate((el) => el.scrollIntoView())
    await finishRecording(page)
    const second = page.locator('#page-305 .ay').nth(1)
    await expect(second).toHaveClass(/playing/)
    await expect(second).toBeInViewport()
  })

  test('…unless following the recitation is turned off', async ({ page }) => {
    const played = await trackAudio(page)
    await useSettings(page, { lang: 'en', autoScroll: false })
    await page.goto('/#/page/305')
    await page.locator('#page-305 .ay').first().click()
    await page.getByTestId('ayah-panel').getByRole('button', { name: 'Play' }).click()
    await page.getByTestId('inspector').getByRole('button', { name: 'Close' }).click()
    await expect.poll(async () => (await played()).length).toBe(1)
    await settle(page)
    await page.locator('#page-320').evaluate((el) => el.scrollIntoView())
    await finishRecording(page)
    await expect(page.locator('#page-305 .ay').nth(1)).toHaveClass(/playing/)
    await expect(page.locator('#page-305 .ay').nth(1)).not.toBeInViewport()
  })

  test('tapping the page opens reading options; a long press on an ayah opens its box, not the browser menu', async ({ page }) => {
    await useSettings(page, { lang: 'en', translations: ['en.sahih'] })
    await page.goto('/#/page/305')
    await expect(page.locator('.mushaf-flow')).toHaveCSS('user-select', 'none')
    await settle(page)
    await page.locator('#page-305 .banner').click()
    const options = page.getByTestId('page-options')
    await expect(options).toContainText(/Page 30[45]/)
    // the options do not repeat Settings: no font, size, translation placement or follow-the-recitation here
    await expect(options.getByRole('combobox')).toHaveCount(0)
    await expect(options.getByRole('checkbox')).toHaveCount(0)
    await expect(options.getByRole('link', { name: 'All settings' })).toBeVisible()
    await page.locator('#page-305 .banner').click()
    await expect(options).toHaveCount(0)

    await page.locator('#page-305 .ay').nth(2).dispatchEvent('contextmenu')
    await expect(page.getByTestId('ayah-panel')).toContainText('19:3')
  })
})

test.describe('page view on a phone', () => {
  test('the translation is a box at the bottom by default; the text keeps its width and the ayah stays clear of the box', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/1')
    await settle(page)
    const before = (await page.locator('#page-1 .flow').first().boundingBox())!
    const ayah = page.locator('#page-1 .ay').nth(2)
    await ayah.click()
    const box = page.getByTestId('sheet')
    await expect(box).toContainText('1:3')
    const b = (await box.boundingBox())!
    const vp = page.viewportSize()!
    expect(b.y + b.height).toBeGreaterThan(vp.height - 30) // docked at the bottom
    await expect.poll(async () => (await ayah.boundingBox())!.y + (await ayah.boundingBox())!.height).toBeLessThan(b.y)
    const after = (await page.locator('#page-1 .flow').first().boundingBox())!
    expect(after.width).toBeGreaterThanOrEqual(before.width - 1)
    // the four places a translation can show
    await page.goto('/#/settings')
    await expect(page.getByLabel('Translation on the page').locator('option')).toHaveText(['In a sheet at the bottom', 'Over the ayah (hover or tap)', 'Under each ayah, in the text', 'Not on the page'])
  })

  test('the sheet has two heights: the handle toggles them, dragging it up grows it and down closes it, Escape closes it', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/1')
    await settle(page)
    const sheet = page.getByTestId('sheet')
    const grab = sheet.getByRole('button', { name: 'Show more' })
    await page.locator('#page-1 .ay').nth(2).click()
    await expect(sheet).toContainText('1:3')
    await expect(grab).toHaveAttribute('aria-expanded', 'false')
    const half = (await sheet.boundingBox())!.height
    expect(half).toBeLessThanOrEqual(page.viewportSize()!.height * 0.46)
    await grab.click()
    await expect(sheet.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true')
    await expect.poll(async () => (await sheet.boundingBox())!.height).toBeGreaterThan(page.viewportSize()!.height * 0.8)
    await sheet.getByRole('button', { name: 'Show less' }).click()
    await expect.poll(async () => (await sheet.boundingBox())!.height).toBeLessThanOrEqual(half + 1)

    // dragging the handle: up for the tall sheet, down to put it away
    const drag = async (dy: number) => {
      const h = (await sheet.locator('.asheet-grab').boundingBox())!
      const x = h.x + h.width / 2
      const y = h.y + h.height / 2
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x, y + dy / 2, { steps: 4 })
      await page.mouse.move(x, y + dy, { steps: 4 })
      await page.mouse.up()
      await page.waitForTimeout(300) // the sheet's height eases to where it was let go
    }
    await drag(-200)
    await expect(sheet.getByRole('button', { name: 'Show less' })).toBeVisible()
    await drag(120) // from the tall sheet, down: back to the lower height, not closed
    await expect(sheet.getByRole('button', { name: 'Show more' })).toBeVisible()
    await drag(160)
    await expect(sheet).toHaveCount(0)
    await expect(page.locator('.ay.sel')).toHaveCount(0)

    await page.locator('#page-1 .ay').nth(3).click()
    await expect(sheet).toContainText('1:4')
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
  })

  test('opening the sheet for an ayah already in view does not scroll the page', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/305')
    await settle(page)
    const first = page.locator('#page-305 .ay').first() // near the top of the screen, clear of the sheet
    const before = (await first.boundingBox())!.y
    await first.click()
    await expect(page.getByTestId('sheet')).toContainText('19:1')
    await page.waitForTimeout(400)
    expect((await first.boundingBox())!.y).toBe(before)
  })

  test('translations can be under every ayah, in the text', async ({ page }) => {
    await useSettings(page, { lang: 'en', translationPlace: 'inline' })
    await page.goto('/#/page/1')
    await settle(page)
    await expect(page.locator('#page-1 .tr-inline')).toHaveCount(7) // one under each ayah
    await expect(page.locator('#page-1 .tr-inline').nth(2)).toContainText('مهربان') // Safavi, the default translation
    await page.locator('#page-1 .ay').nth(2).click()
    const sheet = page.getByTestId('sheet')
    await expect(sheet).toContainText('1:3')
    await expect(sheet.locator('.tr')).toHaveCount(0) // already on the page, so not again in the sheet
    await page.keyboard.press('Escape')
    await page.goto('/#/settings')
    await expect(page.getByLabel('Translation on the page')).toHaveValue('inline')
  })

  test('translations can be left off the page, and an ayah still opens its actions', async ({ page }) => {
    await useSettings(page, { lang: 'en', translationPlace: 'off' })
    await page.goto('/#/page/1')
    await settle(page)
    await expect(page.locator('#page-1 .tr-inline')).toHaveCount(0)
    await page.locator('#page-1 .ay').nth(2).click()
    const sheet = page.getByTestId('sheet')
    await expect(sheet).toContainText('1:3')
    await expect(sheet.getByRole('button', { name: 'Play from here' })).toBeVisible()
    await expect(sheet.locator('.tr')).toHaveCount(0)
  })

  test('over the ayah, as a card, when chosen', async ({ page }) => {
    await useSettings(page, { lang: 'en', pageBox: 'popup' }) // the old setting, from before translationPlace: it still means "over the ayah"
    await page.goto('/#/page/1')
    await settle(page)
    await page.locator('#page-1 .ay').nth(2).click()
    await expect(page.getByTestId('sheet')).toHaveCount(0)
    await expect(page.locator('.ayah-popup')).toContainText('1:3')
  })

  test('the card never sits under the recitation bar, or under the app bar', async ({ page }) => {
    await trackAudio(page)
    await useSettings(page, { lang: 'en', translationPlace: 'card' })
    await page.goto('/#/page/1')
    await settle(page)
    await page.locator('#page-1 .ay').nth(2).click()
    await page.locator('.ayah-popup').getByRole('button', { name: 'Play from here' }).click()
    await expect(page.locator('.player')).toBeVisible()
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--player-h'))).not.toBe('0px')
    // an ayah low on the screen: the card goes above it rather than under the player bar
    await page.locator('#page-1 .ay').nth(6).evaluate((el) => el.scrollIntoView({ block: 'end' }))
    await page.locator('#page-1 .ay').nth(6).click()
    await page.locator('#page-1 .ay').nth(6).click() // closes, then opens again, so the card is placed afresh
    const card = (await page.locator('.ayah-popup').boundingBox())!
    const bar = (await page.locator('.player').boundingBox())!
    const top = (await page.locator('.appbar').boundingBox())!
    expect(card.y + card.height).toBeLessThanOrEqual(bar.y + 1)
    expect(card.y).toBeGreaterThanOrEqual(top.y + top.height - 1)
  })

  test('the recitation bar never covers the translation box at the bottom', async ({ page }) => {
    await trackAudio(page)
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/1')
    await settle(page)
    await page.locator('#page-1 .ay').nth(2).click()
    await page.getByTestId('ayah-panel').getByRole('button', { name: 'Play' }).click()
    await expect(page.locator('.player')).toBeVisible()
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--player-h'))).not.toBe('0px')
    const box = (await page.getByTestId('sheet').boundingBox())!
    const bar = (await page.locator('.player').boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(bar.y + 1)
  })

  test('no bottom bar: one small menu button at the top left opens Quran, Today, Search, Saved and Settings', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/settings')
    await expect(page.locator('.bottom-nav')).toHaveCount(0)
    const btn = menu(page)
    const r = (await btn.boundingBox())!
    expect(r.x).toBeLessThan(20)
    expect(r.y).toBeLessThan(20)
    expect(r.width).toBeLessThanOrEqual(44)
    await btn.click()
    const nav = page.getByRole('navigation', { name: 'Main' })
    await expect(nav.getByRole('link')).toHaveText(['Quran', 'Today', 'Search', 'Saved', 'Settings'])
    await expect(nav.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
    await nav.getByRole('link', { name: 'Search' }).click()
    await expect(page).toHaveURL(/#\/search$/)
    await expect(nav).toHaveCount(0) // closes after a choice
  })

  test('the end of each line is not clipped: the page has room for the glyphs that overhang', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/3')
    await settle(page)
    const pad = await page.locator('#page-3').evaluate((e) => parseFloat(getComputedStyle(e).paddingRight))
    expect(pad).toBeGreaterThanOrEqual(8)
    const flow = (await page.locator('#page-3 .flow').first().boundingBox())!
    const page3 = (await page.locator('#page-3').boundingBox())!
    expect(page3.x + page3.width).toBeGreaterThan(flow.x + flow.width + 4)
  })
})

test.describe('The Study Quran (private content, made-up text here)', () => {
  // Ayah ids of surah 2 are 7 + number. Notes: 1–5, 6–10, 11–15 and an overlapping 11–12.
  const entry = (eid: string, first: number, last: number, order: number) => ({
    id: eid, surah_id: 2, note_label: `${first}`, first_ayah: first, last_ayah: last, coverage_kind: 'explicit_note', lemma_text: '',
    text: `[Made-up note ${first}–${last}.] See 2:${first}.`, html: '', pages: [100 + order],
    ayah_ids: Array.from({ length: last - first + 1 }, (_, i) => 7 + first + i),
    references: [{ raw: `2:${first}`, target_kind: 'ayah', target_surah: 2, first_ayah: first, last_ayah: first }],
  })
  const entries = [entry('a', 1, 5, 1), entry('b', 6, 10, 2), entry('c', 11, 15, 3), entry('d', 11, 12, 4)]
  const byAyah: Record<string, string[]> = {}
  for (const e of entries) for (const a of e.ayah_ids) (byAyah[String(a)] ??= []).push(e.id)

  test.beforeEach(async ({ page }) => {
    await page.route('**/data/meta.json*', async (route) => {
      const response = await route.fetch()
      route.fulfill({ response, json: { ...(await response.json()), studyQuran: { id: 'study_quran', name: 'The Study Quran', pdfSha256: 'x', importVersion: 't' } } })
    })
    // routes registered later win, so the general one goes first
    await page.route('**/data/tafsir/study_quran/*.json*', (route) => route.fulfill({ json: { surah: 1, entries: [], byAyah: {} } }))
    await page.route('**/data/tafsir/study_quran/2.json*', (route) => route.fulfill({ json: { surah: 2, entries, byAyah } }))
    await page.route('**/data/intro/study_quran/2.json*', (route) =>
      route.fulfill({ json: { text: '[Made-up introduction.]\n\nSecond paragraph.', html: '', pages: [90, 91] } }))
  })
  test.use({ serviceWorkers: 'block' })

  test('Study view: one chip where a note starts, none repeated under the ayahs it also covers', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/verse/2')
    await expect(page.locator('article#a-1 .study-chip')).toHaveText(/Commentary on 2:1–5/)
    for (const n of [2, 3, 4, 5]) await expect(page.locator(`article#a-${n} .study-chip`)).toHaveCount(0)
    await expect(page.locator('article#a-6 .study-chip')).toHaveText(/2:6–10/)
    // two notes start at 11: the shared 11–15 and the overlapping 11–12
    await expect(page.locator('article#a-11 .study-chip')).toHaveCount(2)
    await expect(page.locator('article#a-12 .study-chip')).toHaveCount(0)
    await expect(page.locator('details.study-panel')).toHaveCount(0)
  })

  test('the chip opens the commentary screen: the notes, the ayahs they explain, and neighbouring notes', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/verse/2')
    await page.locator('article#a-6 .study-chip').click()
    await expect(page).toHaveURL(/#\/commentary\/2\/6$/)
    const c = page.locator('article.commentary')
    await expect(c.locator('.study-note')).toHaveCount(1)
    await expect(c).toContainText('[Made-up note 6–10.]')
    await expect(c.locator('.comm-nums a')).toHaveText(['6', '7', '8', '9', '10'])
    await expect(c.getByRole('link', { name: /Previous note · 2:1–5/ })).toBeVisible()
    await expect(c.getByRole('link', { name: /Next note · 2:11–15/ })).toBeVisible()
    await c.getByRole('link', { name: /Next note/ }).click()
    await expect(page.locator('article.commentary .study-note')).toHaveCount(2) // 11–15 and the overlapping 11–12
  })

  test('the introduction has its own row and screen', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/verse/2')
    await page.getByRole('link', { name: /About this surah/ }).click()
    await expect(page).toHaveURL(/#\/intro\/2$/)
    await expect(page.locator('article.commentary')).toContainText('[Made-up introduction.]')
    await page.getByRole('link', { name: /Start reading 2:1/ }).click()
    await expect(page).toHaveURL(/#\/verse\/2\/1$/)
  })

  test('page view: the ayah card lists the notes that cover the ayah, as chips', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/2')
    await settle(page)
    await page.locator('#page-2 .ay').nth(3).click() // 2:4 (the page starts at 2:1 here)
    const card = page.getByTestId('sheet')
    await expect(card.locator('.study-chip')).toHaveText(/Commentary on 2:1–5/)
    await expect(card.locator('details')).toHaveCount(0)
  })
})

test.describe('The printed mushaf as pictures (private build, made-up pictures here)', () => {
  // A 1x1 PNG stands in for the page scans; the real ones are private and never in the tests.
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  test.beforeEach(async ({ page }) => {
    let pages: number[] = []
    await page.route('**/data/meta.json*', async (route) => {
      const response = await route.fetch()
      const meta = await response.json()
      pages = meta.pages
      route.fulfill({ response, json: { ...meta, mushaf: { v: 'test', w: 654, h: 935 } } })
    })
    await page.route('**/data/mushaf/map.json*', async (route) => {
      const list = Array.from({ length: 604 }, (_, i) => {
        const first = pages[i]!
        const count = (pages[i + 1] ?? 6237) - first
        return { n: i + 1, first, w: 654, h: 935, a: Array.from({ length: count }, (_, k) => [[100, 50 + Math.floor((k * 880) / count), 800, Math.floor(800 / count)]]) }
      })
      route.fulfill({ json: { v: 'test', pages: list } })
    })
    await page.route('**/data/mushaf/*.webp*', (route) => route.fulfill({ contentType: 'image/png', body: PNG }))
  })
  test.use({ serviceWorkers: 'block' })

  test('a page is a picture with one tappable area per ayah; tapping one selects it', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/3')
    await expect(page.locator('#page-3 .pg-img')).toBeVisible()
    await expect(page.locator('#page-3 .ay')).toHaveCount(11) // 2:6-16
    await expect(page.locator('.mushaf-bar')).toHaveCount(0) // the printed page shows its own surah, juz and number
    await expect(page.locator('#page-3 .flow')).toHaveCount(0)
    await settle(page)
    await page.locator('#page-3 .ay').nth(1).locator('.seg').click()
    await expect(page.getByTestId('ayah-panel')).toContainText('2:7')
    await expect(page.locator('.ay.sel')).toHaveCount(1)
    await expect(page.locator('.ay.sel .seg')).toHaveCSS('background-color', /rgba\(255, 196, 40/)
  })

  test('the page number on the page opens "go to page", and so do the reading options', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/5')
    await settle(page)
    await page.locator('#page-5 .pg-no').click()
    await page.getByLabel('Go to page').fill('12')
    await page.keyboard.press('Enter')
    await expect(page.locator('#page-12')).toBeInViewport()
    await settle(page)
    await page.locator('#page-12 .pg').click({ position: { x: 5, y: 5 } }) // not on an ayah: the reading options
    await page.getByTestId('page-options').getByRole('button', { name: 'Go to page' }).click()
    await page.getByLabel('Go to page').fill('20')
    await page.keyboard.press('Enter')
    await expect(page.locator('#page-20')).toBeInViewport()
  })

  test('page colour is a filter on the picture only', async ({ page }) => {
    await useSettings(page, { lang: 'en', pageColor: 'dark' })
    await page.goto('/#/page/3')
    await expect(page.locator('#page-3 .pg-img')).toHaveCSS('filter', /invert/)
    await expect(page.locator('#page-3 .ay').first().locator('.seg')).not.toHaveCSS('filter', /invert/)
    await page.goto('/#/settings')
    await page.getByLabel('Page colour').selectOption({ label: 'Pink' })
    await page.goto('/#/page/3')
    await expect(page.locator('#page-3 .pg-img')).toHaveCSS('filter', /hue-rotate/)
  })
})

test.describe('the drawer', () => {
  test('the burger opens it, Escape, the backdrop, a choice and Back close it, and focus returns to the burger', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/305')
    await expect(page.locator('#page-305 .ay').first()).toBeVisible()
    const drawer = page.getByRole('dialog', { name: 'Menu' })
    await menu(page).click()
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('link').first()).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
    await expect(menu(page)).toBeFocused()

    await menu(page).click()
    await page.locator('.drawer-backdrop').click({ position: { x: 380, y: 400 } })
    await expect(drawer).toHaveCount(0)

    await menu(page).click()
    await page.goBack()
    await expect(drawer).toHaveCount(0)
    await expect(page).toHaveURL(/#\/page\/305$/) // Back closed the drawer and nothing else

    await menu(page).click()
    await drawer.getByRole('link', { name: 'Saved' }).click()
    await expect(page).toHaveURL(/#\/saved$/)
    await expect(drawer).toHaveCount(0)
    await page.goBack()
    await expect(page).toHaveURL(/#\/page\/305$/) // choosing from the drawer left no twin of the page behind
  })

  test('Tab stays inside the open drawer, and nothing behind it can be reached', async ({ page }) => {
    await useSettings(page, { lang: 'en' })
    await page.goto('/#/page/305')
    await menu(page).click()
    const drawer = page.getByRole('dialog', { name: 'Menu' })
    for (let i = 0; i < 9; i++) {
      await page.keyboard.press('Tab')
      expect(await drawer.evaluate((d) => d.contains(document.activeElement))).toBe(true)
    }
    await expect(page.locator('#main')).toHaveAttribute('inert', '')
  })

  test('in Persian it comes from the right', async ({ page }) => {
    await useSettings(page, { lang: 'fa' })
    await page.goto('/#/page/305')
    await page.getByRole('button', { name: 'منو' }).last().click()
    await page.waitForTimeout(400) // the slide
    const box = (await page.getByRole('dialog', { name: 'منو' }).boundingBox())!
    expect(box.x + box.width).toBeGreaterThan(page.viewportSize()!.width - 2)
  })
})
