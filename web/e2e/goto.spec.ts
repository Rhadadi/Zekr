import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const settings = (lang: 'en' | 'fa', theme = 'light') => [{ lang, theme, translationPlace: 'panel' }]

test.describe('Go to…', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('Ctrl/Cmd-K opens it; a surah and ayah in Persian digits goes there; Escape closes it and gives focus back', async ({ page }) => {
    await page.addInitScript(([s]) => { localStorage.setItem('zekr.inlineDefault', 'true'); localStorage.setItem('zekr.settings', JSON.stringify(s)) }, settings('fa'))
    await page.goto('/#/page/305')
    await page.locator('#page-305 .ay').first().focus()
    await page.keyboard.press('Control+k')
    const box = page.getByRole('dialog', { name: 'رفتن به…' })
    await expect(box).toBeVisible()
    const field = box.getByRole('combobox')
    await expect(field).toBeFocused()
    await field.fill('۲:۲۵۵')
    await expect(box.getByRole('option')).toHaveCount(1)
    await expect(box.getByRole('option').first()).toContainText('۲:۲۵۵')
    await page.keyboard.press('Enter')
    await expect(box).toHaveCount(0)
    await expect(page).toHaveURL(/#\/ayah\/2\/255$/)
    await expect(page.getByTestId('ayah-panel')).toContainText('۲:۲۵۵')

    await page.keyboard.press('Control+k')
    await page.getByRole('combobox').fill('xyz')
    await expect(page.getByText('موردی پیدا نشد')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(box).toHaveCount(0)
  })

  test('names, pages and juz in English; the arrows choose; a click goes', async ({ page }) => {
    await page.addInitScript(([s]) => { localStorage.setItem('zekr.inlineDefault', 'true'); localStorage.setItem('zekr.settings', JSON.stringify(s)) }, settings('en'))
    await page.goto('/#/page/305')
    await expect(page.locator('#page-305 .ay').first()).toBeVisible() // the app is up
    await page.keyboard.press('Control+k')
    const field = page.getByRole('combobox', { name: 'Go to…' })
    await field.fill('12')
    const options = page.getByRole('option')
    await expect(options).toHaveText([/12 · Yusuf/, /Page 12/, /Juz 12/])
    await page.keyboard.press('ArrowDown')
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(field).toHaveAttribute('aria-activedescendant', 'goto-1')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#\/page\/12$/)
    await page.keyboard.press('Control+k')
    await page.getByRole('combobox').fill('maryam')
    await page.getByRole('option', { name: /Maryam/ }).click()
    await expect(page).toHaveURL(/#\/surah\/19$/)
    await expect(page.locator('.mb-surah')).toContainText('مريم')
  })

  test('opened again the moment it closes, it stays open (the old box\'s late "close" event does not shut the new one)', async ({ page }) => {
    await page.addInitScript(([s]) => { localStorage.setItem('zekr.inlineDefault', 'true'); localStorage.setItem('zekr.settings', JSON.stringify(s)) }, settings('en'))
    await page.goto('/#/page/305')
    await expect(page.locator('#page-305 .ay').first()).toBeVisible()
    await page.keyboard.press('Control+k')
    await page.getByRole('combobox').fill('12')
    // choose, and press Ctrl-K at the very moment the old box leaves the page, before its "close" event arrives
    await page.evaluate(() => {
      const old = document.querySelector('dialog.goto')!
      new MutationObserver((_, obs) => {
        if (old.isConnected) return
        obs.disconnect()
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true }))
      }).observe(document.body, { childList: true, subtree: true })
      old.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await expect(page).toHaveURL(/#\/surah\/12$/)
    await page.waitForTimeout(300)
    await expect(page.getByRole('combobox')).toBeVisible()
  })

  test('the menu has it too, and it has no accessibility violations open, in dark', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(([s]) => { localStorage.setItem('zekr.inlineDefault', 'true'); localStorage.setItem('zekr.settings', JSON.stringify(s)) }, settings('en', 'dark'))
    await page.goto('/#/page/305')
    await page.getByRole('button', { name: 'Menu' }).last().click()
    await page.getByRole('button', { name: 'Go to…' }).click()
    await expect(page.getByRole('dialog', { name: 'Go to…' })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Menu' })).toHaveCount(0)
    await page.getByRole('combobox').fill('juz 16')
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).include('dialog.goto').analyze()
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#\/page\/302$/)
  })
})
