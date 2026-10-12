import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const pages = ['#/', '#/index', '#/ayah/17/24', '#/daily', '#/search?q=%D8%B1%D8%AD%D9%85%D8%A9', '#/saved', '#/settings', '#/about']

for (const theme of ['light', 'sepia', 'dark'] as const) {
  for (const lang of ['en', 'fa'] as const) {
    test(`no accessibility violations: ${lang}, ${theme}`, async ({ page }) => {
      await page.addInitScript(([l, t]) => localStorage.setItem('zekr.settings', JSON.stringify({ lang: l, theme: t })), [lang, theme])
      const problems: string[] = []
      for (const path of pages) {
        await page.goto('/' + path)
        await page.waitForSelector('main#main :is(article, .card, ul.list, .status, p, h2)')
        await page.waitForTimeout(300)
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
        const summary = result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
        problems.push(...summary.map((m) => `${path}: ${m}`))
      }
      expect(problems).toEqual([])
    })
  }
}
