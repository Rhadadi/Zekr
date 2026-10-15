import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const pages = ['#/', '#/today', '#/index', '#/ayah/17/24', '#/verse/17/24', '#/page/305', '#/page/1', '#/daily', '#/search?q=%D8%B1%D8%AD%D9%85%D8%A9', '#/saved', '#/settings', '#/about']

for (const theme of ['light', 'sepia', 'dark'] as const) {
  for (const lang of ['en', 'fa'] as const) {
    test(`no accessibility violations: ${lang}, ${theme}`, async ({ page }) => {
      test.setTimeout(120_000) // eleven routes with the whole mushaf mounted; slow when the machine is busy
      await page.addInitScript(([l, t]) => localStorage.setItem('zekr.settings', JSON.stringify({ lang: l, theme: t })), [lang, theme])
      const problems: string[] = []
      for (const path of pages) {
        await page.goto('/' + path)
        await page.waitForSelector('main#main :is(article, .card, ul.list, .status, p, h2)')
        await page.waitForTimeout(300)
        // The mushaf is always mounted: under a layer it is inert and skipped; on its own, only the page on screen is checked
        // (the others are the same markup).
        let axe = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa'])
        if (await page.locator('.layer').count()) axe = axe.exclude('.mushaf-host')
        else {
          const shown = await page.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight * 0.3)?.closest('.mpage')?.id ?? null)
          if (shown) axe = axe.exclude(`.mpage:not(#${shown})`)
        }
        const result = await axe.analyze()
        const summary = result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
        problems.push(...summary.map((m) => `${path}: ${m}`))
      }
      expect(problems).toEqual([])
    })
  }
}
