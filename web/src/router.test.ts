// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('location', { hash: '' })
vi.stubGlobal('history', { state: null, replaceState: () => {} })
vi.stubGlobal('window', { addEventListener: () => {} })
const { parseRoute } = await import('./router')

describe('parseRoute', () => {
  it('opens the Quran by default (no layer, no position), and the ayah of the day as a layer at #/today', () => {
    for (const h of ['', '#/', '#/nonsense']) expect(parseRoute(h)).toEqual({ layer: null, query: expect.anything() })
    expect(parseRoute('#/today').base).toBeUndefined()
    expect(parseRoute('#/today').layer).toEqual({ name: 'today' })
  })
  it('opens the mushaf at a surah or an ayah, with the ayah selected', () => {
    expect(parseRoute('#/surah/17')).toMatchObject({ base: { surah: 17, ayah: undefined, select: false }, layer: null })
    expect(parseRoute('#/ayah/17/24')).toMatchObject({ base: { surah: 17, ayah: 24, select: true }, layer: null })
    expect(parseRoute('#/surah/17/24')).toMatchObject({ base: { surah: 17, ayah: 24, select: true }, layer: null })
  })
  it('falls back to the index layer for a bad surah or page', () => {
    for (const h of ['#/surah/0', '#/surah/115', '#/surah/abc', '#/page/0', '#/page/605', '#/intro/0', '#/commentary/200/1']) {
      expect(parseRoute(h).layer).toEqual({ name: 'index' })
      expect(parseRoute(h).base).toBeUndefined()
    }
  })
  it('reads the query string', () => {
    const r = parseRoute('#/search?q=%D8%B1%D8%AD%D9%85%D8%A9')
    expect(r.layer?.name).toBe('search')
    expect(r.query.get('q')).toBe('رحمة')
  })
})

describe('pages, the Study view and the other layers', () => {
  it('parses page numbers', () => {
    expect(parseRoute('#/page/305')).toMatchObject({ base: { page: 305 }, layer: null })
  })
  it('opens the Study view as a layer over the mushaf at that ayah', () => {
    expect(parseRoute('#/verse/17/24')).toMatchObject({ base: { surah: 17, ayah: 24 }, layer: { name: 'study', surah: 17, ayah: 24 } })
    expect(parseRoute('#/verse/1')).toMatchObject({ base: { surah: 1 }, layer: { name: 'study', surah: 1 } })
  })
  it('commentary, introduction and tafsir keep the mushaf at their ayah', () => {
    expect(parseRoute('#/commentary/2/6')).toMatchObject({ base: { surah: 2, ayah: 6 }, layer: { name: 'commentary', surah: 2, ayah: 6 } })
    expect(parseRoute('#/intro/2')).toMatchObject({ base: { surah: 2 }, layer: { name: 'intro', surah: 2 } })
    expect(parseRoute('#/tafsir/19/7')).toMatchObject({ base: { surah: 19, ayah: 7 }, layer: { name: 'tafsir', surah: 19, ayah: 7 } })
  })
  it('a plain layer leaves the mushaf where it is', () => {
    for (const name of ['index', 'daily', 'search', 'saved', 'settings', 'about']) {
      expect(parseRoute(`#/${name}`).layer).toEqual({ name })
      expect(parseRoute(`#/${name}`).base).toBeUndefined()
    }
  })
})
