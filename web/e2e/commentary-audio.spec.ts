import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Invented notes only. Shared passages and missing audio exercise the queue boundaries.
const note = (id: string, first: number, last: number, narrated = true) => ({
  id, surah_id: 2, note_label: String(first), first_ayah: first, last_ayah: last,
  coverage_kind: 'explicit_note', lemma_text: '', html: '', text: `An invented example for ayahs ${first} to ${last}.`,
  ayah_ids: Array.from({ length: last - first + 1 }, (_, i) => first + i + 7), pages: [1], references: [],
  ...(narrated ? { audio: { file: `${id}.mp3`, duration: 120, voice: 'Example narrator', model: 'fixture', sha256: id } } : {}),
})
const entries = [note('one', 1, 5), note('silent', 6, 10, false), note('two', 11, 12)]
const byAyah: Record<string, string[]> = {}
for (const entry of entries) for (const id of entry.ayah_ids) (byAyah[String(id)] ??= []).push(entry.id)

async function fixture(page: Page, lang = 'en', theme = 'light') {
  await page.addInitScript(([l, t]) => {
    localStorage.setItem('zekr.settings', JSON.stringify({ lang: l, theme: t }))
    const w = window as unknown as { testAudio: EventTarget[]; played: string[] }
    w.testAudio = []; w.played = []
    // Test the real queue and controls without requesting external recitations or copyrighted media.
    class FixtureAudio extends EventTarget {
      src = ''; preload = ''; currentTime = 0; duration = 120
      paused = true; ended = false; defaultPlaybackRate = 1; playbackRate = 1
      play() {
        if (!w.testAudio.includes(this)) w.testAudio.push(this)
        w.played.push(this.src); this.paused = false
        this.dispatchEvent(new Event('playing'))
        return Promise.resolve()
      }
      pause() { this.paused = true; this.dispatchEvent(new Event('pause')) }
      removeAttribute(name: string) { if (name === 'src') this.src = '' }
      getAttribute(name: string) { return name === 'src' ? this.src : null }
      load() { /* no network in queue tests */ }
    }
    window.Audio = FixtureAudio as unknown as typeof Audio
  }, [lang, theme])
  await page.route('**/everyayah.com/**', (route) => route.abort())
  await page.route('**/data/commentary-audio/**', (route) => route.abort())
  await page.route('**/data/meta.json*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, json: { ...(await response.json()), studyQuran: {
      id: 'study_quran', name: 'The Study Quran', pdfSha256: 'fixture', importVersion: 'fixture',
      audio: { surahs: [2], entries: 2, bytes: 100 },
    } } })
  })
  await page.route('**/data/tafsir/study_quran/2.json*', (route) => route.fulfill({ json: { surah: 2, entries, byAyah } }))
}

test.use({ serviceWorkers: 'block' })

test('shared notes play once, skip unrecorded notes, and recitation replaces commentary', async ({ page }) => {
  await fixture(page)
  await page.goto('/#/commentary/2/3')
  await page.getByRole('button', { name: /Listen from here/ }).click()
  const bar = page.locator('.player')
  await expect(bar).toHaveClass(/has-commentary/)
  await expect(bar).toContainText('2:1')
  await expect(bar.getByRole('slider')).toHaveAttribute('max', '120')
  await page.evaluate(() => {
    const w = window as unknown as { testAudio: HTMLMediaElement[] }
    w.testAudio[0]!.dispatchEvent(new Event('ended'))
  })
  await expect(bar).toContainText('2:11')
  const played = () => page.evaluate(() => (window as unknown as { played: string[] }).played)
  expect((await played()).map((url) => new URL(url).pathname.split('/').pop())).toEqual(['one.mp3', 'two.mp3'])
  await bar.getByRole('button', { name: 'Previous note' }).click()
  await expect(bar).toContainText('2:1')
  await bar.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(bar).toHaveAttribute('data-status', 'paused')
  await bar.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(bar).toHaveAttribute('data-status', 'playing')
  await page.goto('/#/verse/2/1')
  await page.locator('article#a-1').getByRole('button', { name: 'Play', exact: true }).click()
  await expect(bar).not.toHaveClass(/has-commentary/)
  expect((await played()).at(-1)).toContain('002001.mp3')
})

for (const lang of ['en', 'fa']) for (const theme of ['light', 'sepia', 'dark']) {
  test(`commentary audio controls are accessible: ${lang}, ${theme}`, async ({ page }) => {
    await fixture(page, lang, theme)
    for (const size of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(size)
      await page.goto('/#/commentary/2/1')
      await page.locator('.study-audio button').click()
      await expect(page.locator('.player.has-commentary')).toBeVisible()
      await expect(page.locator('.study-audio')).toHaveAttribute('dir', lang === 'fa' ? 'rtl' : 'ltr')
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
      for (const button of await page.locator('.study-audio button, .player button, .player input').all()) {
        const box = (await button.boundingBox())!
        expect(box.height).toBeGreaterThanOrEqual(44)
        expect(box.width).toBeGreaterThanOrEqual(44)
      }
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.mushaf-host').analyze()
      expect(result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))).toEqual([])
    }
  })
}
