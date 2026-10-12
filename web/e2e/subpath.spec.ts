import { createServer, type Server } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

// GitHub Pages serves a project site from https://<user>.github.io/<repo>/, not from the root.
// Serve the production build under /Zekr/ the same way and check that everything still works.
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain',
}
const PORT = 4180
const dist = fileURLToPath(new URL('../dist', import.meta.url))
let server: Server

// One server for both tests, so they must share a worker.
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith('/Zekr/')) {
      res.writeHead(404).end('not found')
      return
    }
    const rel = normalize(decodeURIComponent(url.pathname.slice('/Zekr/'.length))).replace(/^(\.\.[/\\])+/, '')
    let file = join(dist, rel || 'index.html')
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
    if (!existsSync(file)) {
      res.writeHead(404).end('not found')
      return
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file))
  })
  await new Promise<void>((resolve) => server.listen(PORT, resolve))
})

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

test('the site works from a sub-path, installs its service worker and runs offline', async ({ page, context }) => {
  const failed: string[] = []
  page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`))
  await page.addInitScript(() => localStorage.setItem('zekr.settings', JSON.stringify({ lang: 'en' })))
  await page.goto(`http://localhost:${PORT}/Zekr/`)
  await expect(page.getByTestId('daily-card')).toBeVisible()
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /manifest\.webmanifest$/)

  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  expect(scope).toBe(`http://localhost:${PORT}/Zekr/`)
  await expect
    .poll(async () => page.evaluate(async () => {
      const key = (await caches.keys()).find((k) => k.includes('precache'))
      return key ? (await (await caches.open(key)).keys()).length : 0
    }), { timeout: 20_000 })
    .toBeGreaterThan(20)

  await page.goto(`http://localhost:${PORT}/Zekr/#/page/305`)
  await expect(page.locator('.ay')).toHaveCount(11)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.ay')).toHaveCount(11)
  expect(failed.filter((f) => !f.includes('favicon'))).toEqual([])
})

test('the manifest and icons resolve under the sub-path', async ({ request }) => {
  const manifest = await request.get(`http://localhost:${PORT}/Zekr/manifest.webmanifest`)
  expect(manifest.ok()).toBe(true)
  const m = await manifest.json()
  expect(m.start_url).toBe('./')
  expect(m.scope).toBe('./')
  for (const icon of m.icons as { src: string }[]) {
    expect((await request.get(`http://localhost:${PORT}/Zekr/${icon.src}`)).ok(), icon.src).toBe(true)
  }
})
