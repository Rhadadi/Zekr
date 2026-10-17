import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { gotoTargets } from './goto'
import type { Meta } from './data'

const file = new URL('../public/data/meta.json', import.meta.url)
describe.skipIf(!existsSync(file))('go to', () => {
  const meta: Meta = JSON.parse(readFileSync(file, 'utf8'))
  const hrefs = (q: string) => gotoTargets(meta, q).map((t) => (t.kind === 'ayah' ? `#/ayah/${t.surah}/${t.ayah}` : t.kind === 'surah' ? `#/surah/${t.surah}` : `#/page/${t.page}`))

  it('reads a surah and ayah in any digits', () => {
    expect(hrefs('2:255')).toEqual(['#/ayah/2/255'])
    expect(hrefs('۲:۲۵۵')).toEqual(['#/ayah/2/255'])
    expect(hrefs('٢٫٢٥٥')).toEqual(['#/ayah/2/255'])
    expect(hrefs('2:300')).toEqual([]) // Al-Baqara has 286
    expect(hrefs('115:1')).toEqual([])
  })

  it('a bare number is a surah, a page and a juz', () => {
    expect(hrefs('12')).toEqual(['#/surah/12', '#/page/12', '#/page/' + hrefs('juz 12')[0]!.split('/').pop()])
    expect(hrefs('235')).toEqual(['#/page/235'])
    expect(hrefs('605')).toEqual([])
  })

  it('reads page and juz in English and Persian', () => {
    expect(hrefs('page 235')).toEqual(['#/page/235'])
    expect(hrefs('صفحه ۲۳۵')).toEqual(['#/page/235'])
    expect(hrefs('جزء ۱۶')).toEqual(hrefs('juz 16'))
    expect(hrefs('juz 16')).toEqual(['#/page/302'])
  })

  it('finds a surah by its name, spelling loosely, with an optional ayah', () => {
    expect(hrefs('baqara')[0]).toBe('#/surah/2')
    expect(hrefs('al-baqara')[0]).toBe('#/surah/2')
    expect(hrefs('maryam')[0]).toBe('#/surah/19')
    expect(hrefs('مریم')[0]).toBe('#/surah/19')
    expect(hrefs('بقره 255')[0]).toBe('#/ayah/2/255')
    expect(hrefs('xyzzy')).toEqual([])
    expect(gotoTargets(meta, '')).toEqual([])
  })
})
