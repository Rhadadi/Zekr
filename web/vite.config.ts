import { existsSync, readFileSync } from 'node:fs'
import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

/** The text and default translations are precached, so the app works offline after the first visit.
 * Other translations are cached when first used, or all at once from Settings > Download for offline. */
function dataPrecache() {
  const meta = 'public/data/meta.json'
  if (!existsSync(meta)) return []
  const { version } = JSON.parse(readFileSync(meta, 'utf8')) as { version: string }
  const files = ['text/uthmani.json', 'text/simple.json', 'text/clean.json', 'tr/fa.safavi.json', 'tr/en.sahih.json', 'pools.json']
  return [
    { url: 'data/meta.json', revision: version },
    ...files.map((f) => ({ url: `data/${f}?v=${version}`, revision: null })),
  ]
}

// Relative base + hash routing: the built site works from any host or sub-path.
export default defineConfig({
  base: './',
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'ذکر · Zekr',
        short_name: 'Zekr',
        description: 'Quran with translations, recitation and an ayah of the day',
        lang: 'fa',
        dir: 'rtl',
        display: 'standalone',
        start_url: './',
        scope: './',
        background_color: '#fbf8f1',
        theme_color: '#1f6f5c',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        globIgnores: ['data/**'],
        additionalManifestEntries: dataPrecache(),
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/data/commentary-audio/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'zekr-commentary-audio', rangeRequests: true,
              cacheableResponse: { statuses: [200] }, expiration: { maxEntries: 6000 },
            },
          },
          // The printed pages (private builds) are big: keep the ones that were read, not all 604 at once.
          {
            urlPattern: ({ url }) => url.pathname.includes('/data/mushaf/'),
            handler: 'CacheFirst',
            options: { cacheName: 'zekr-mushaf', expiration: { maxEntries: 700 } },
          },
          // Everything else under data/ is requested with ?v=<data version>, so it never changes.
          {
            urlPattern: ({ url }) => url.pathname.includes('/data/'),
            handler: 'CacheFirst',
            options: { cacheName: 'zekr-data', expiration: { maxEntries: 320 } },
          },
        ],
      },
    }),
  ],
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})
