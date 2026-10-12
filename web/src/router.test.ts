// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('location', { hash: '' })
vi.stubGlobal('window', { addEventListener: () => {} })
const { parseRoute } = await import('./router')

describe('parseRoute', () => {
  it('opens the home page by default', () => {
    expect(parseRoute('').name).toBe('home')
    expect(parseRoute('#/').name).toBe('home')
    expect(parseRoute('#/nonsense').name).toBe('home')
  })
  it('parses surah and ayah links', () => {
    expect(parseRoute('#/surah/17')).toMatchObject({ name: 'reader', surah: 17, ayah: undefined })
    expect(parseRoute('#/ayah/17/24')).toMatchObject({ name: 'reader', surah: 17, ayah: 24 })
    expect(parseRoute('#/surah/17/24')).toMatchObject({ name: 'reader', surah: 17, ayah: 24 })
  })
  it('falls back to the index for a bad surah', () => {
    expect(parseRoute('#/surah/0').name).toBe('index')
    expect(parseRoute('#/surah/115').name).toBe('index')
    expect(parseRoute('#/surah/abc').name).toBe('index')
  })
  it('reads the query string', () => {
    const r = parseRoute('#/search?q=%D8%B1%D8%AD%D9%85%D8%A9')
    expect(r.name).toBe('search')
    expect(r.query.get('q')).toBe('رحمة')
  })
})
