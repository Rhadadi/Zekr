import { describe, expect, it } from 'vitest'
import type { MushafPageMap } from './data'
import { lineTranslations, pageStrips, splitAcross } from './interlinear'

// A made-up page: three lines; ayah 10 fills line 1 and the right half of line 2, ayah 11 the rest; line 3 is a
// banner (no ayahs) between lines 2 and 4.
const pg: MushafPageMap = {
  n: 9, first: 10, w: 654, h: 935,
  a: [
    [[100, 73, 800, 56], [500, 131, 400, 56]],
    [[100, 131, 400, 56], [100, 306, 800, 56]],
  ],
}

describe('translation under each line of a printed page', () => {
  it('cuts the page into the lines and the parts between them, with nothing left out', () => {
    const strips = pageStrips(pg)
    expect(strips[0]!.top).toBe(0)
    expect(strips.at(-1)!.bottom).toBe(1000)
    for (let i = 1; i < strips.length; i++) expect(strips[i]!.top).toBe(strips[i - 1]!.bottom)
    const lines = strips.filter((s) => s.line)
    expect(lines).toHaveLength(3)
    expect(lines[1]!.line!.map((s) => s.id)).toEqual([10, 11]) // right to left
    expect(strips.some((s) => !s.line && s.top > 187 && s.bottom < 306)).toBe(true) // the banner is its own strip
  })

  it('ends a line just above the border of the banner after it, when the border reaches up into the line', () => {
    // a picture 935 rows high: some text ink low in line 2 (bottom 187), and the banner's border from 180 down
    const ink = new Float32Array(935)
    const row = (y: number) => Math.round((y / 1000) * 935)
    for (let y = row(175); y < row(180); y++) ink[y] = 0.5
    for (let y = row(180); y < row(186); y++) ink[y] = 1
    const strips = pageStrips(pg, ink)
    const line2 = strips.filter((s) => s.line)[1]!
    expect(line2.bottom).toBeLessThan(180)
    expect(line2.bottom).toBeGreaterThanOrEqual(177) // the text ink above the border stays with its line
    for (let i = 1; i < strips.length; i++) expect(strips[i]!.top).toBe(strips[i - 1]!.bottom)
    expect(pageStrips(pg, new Float32Array(935)).filter((s) => s.line)[1]!.bottom).toBe(189) // no border: as before
  })

  it('shares an ayah\'s words over its pieces by their size, keeping every word once', () => {
    const text = 'a b c d e f g h i j k l'
    const parts = splitAcross(text, [800, 400])
    expect(parts.join(' ')).toBe(text)
    expect(parts[0]!.split(' ').length).toBe(8)
    expect(splitAcross('one', [100])).toEqual(['one'])
    expect(splitAcross('', [100, 100])).toEqual(['', ''])
    expect(splitAcross('x y', [1, 1, 1]).filter(Boolean).length).toBeGreaterThanOrEqual(2)
  })

  it('puts each ayah\'s number under the line where the Arabic ayah ends', () => {
    const strips = pageStrips(pg)
    const texts: string[] = []
    texts[9] = 'one two three four five six'
    texts[10] = 'seven eight nine'
    const pieces = [...lineTranslations(pg, strips, texts).values()]
    expect(pieces[0]).toEqual([{ id: 10, x: 100, w: 800, text: 'one two three four', ends: false }])
    expect(pieces[1]!.map((p) => [p.id, p.ends])).toEqual([[10, true], [11, false]])
    expect(pieces[2]!.at(-1)!.ends).toBe(true)
    expect(pieces.flat().filter((p) => p.id === 11).map((p) => p.text).join(' ')).toBe('seven eight nine')
  })
})

describe('on the real printed pages (when assets/mushaf is there)', async () => {
  const { existsSync, readFileSync } = await import('node:fs')
  const file = new URL('../../assets/mushaf/map.json', import.meta.url)
  it.runIf(existsSync(file))('every page cuts into contiguous strips, and every ayah piece is on one text line', () => {
    const pages = (JSON.parse(readFileSync(file, 'utf8')) as { pages: MushafPageMap[] }).pages
    expect(pages).toHaveLength(604)
    for (const pg of pages) {
      const strips = pageStrips(pg)
      expect(strips[0]!.top).toBe(0)
      expect(strips.at(-1)!.bottom).toBe(1000)
      for (let i = 1; i < strips.length; i++) expect(strips[i]!.top, `page ${pg.n}`).toBe(strips[i - 1]!.bottom)
      const placed = strips.flatMap((s) => s.line ?? [])
      expect(placed.length, `page ${pg.n}`).toBe(pg.a.flat().length)
      for (const s of strips) for (const seg of s.line ?? []) {
        expect(seg.y, `page ${pg.n}`).toBeGreaterThanOrEqual(s.top - 2)
        expect(seg.y + seg.h, `page ${pg.n}`).toBeLessThanOrEqual(s.bottom + 2) // the round opening pages' lines touch
      }
      if (pg.n > 2) expect(strips.filter((s) => s.line).length, `page ${pg.n}`).toBeLessThanOrEqual(15)
    }
  })
})
