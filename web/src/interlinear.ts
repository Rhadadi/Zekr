// Translation under each line of a printed page. The page picture is cut into its lines (and the parts between them:
// the frame, surah banners, basmala), and under every line of text comes the translation of what is on that line.
// We know where each ayah sits on each line (map.json), so an ayah's translation is shared out over its lines in
// proportion to how much of each line it takes, and its number ends up under the Arabic ayah number.
import type { MushafPageMap } from './data'

export interface Seg { id: number; x: number; y: number; w: number; h: number }
/** A horizontal slice of the page picture, in thousandths of its height. `line` holds the ayah pieces on a text line. */
export interface Strip { top: number; bottom: number; line?: Seg[] }

/** Cut a page into strips: one per line of text (with its ayah pieces, right to left), and the parts in between. */
export function pageStrips(pg: MushafPageMap): Strip[] {
  const segs: Seg[] = pg.a.flatMap((rects, k) => rects.map(([x, y, w, h]) => ({ id: pg.first + k, x, y, w, h })))
  const lines = new Map<number, Seg[]>()
  for (const s of segs) {
    // pieces of one line share their top (give or take a rounding unit)
    const key = [...lines.keys()].find((y) => Math.abs(y - s.y) <= 3) ?? s.y
    lines.set(key, [...(lines.get(key) ?? []), s])
  }
  const sorted = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l.sort((a, b) => b.x - a.x))
  const out: Strip[] = []
  let at = 0
  sorted.forEach((line, i) => {
    const top = Math.min(...line.map((s) => s.y))
    const bottom = Math.max(...line.map((s) => s.y + s.h))
    if (i === 0 && top > 2) {
      out.push({ top: 0, bottom: top - 2 }) // the top of the frame (the juz and surah tabs)
      at = top - 2
    }
    const next = sorted[i + 1]
    const nextTop = next ? Math.min(...next.map((s) => s.y)) : 1000
    const gap = nextTop - bottom
    if (next && gap < (bottom - top) / 2) {
      // lines next to each other: split the small gap in the middle
      const end = bottom + Math.floor(gap / 2)
      out.push({ top: at, bottom: end, line })
      at = end
    } else {
      // a banner, the basmala, or the bottom of the frame follows: it is a strip of its own
      const end = Math.min(bottom + 2, 1000)
      out.push({ top: at, bottom: end, line })
      const after = next ? nextTop - 2 : 1000
      if (after > end) out.push({ top: end, bottom: after })
      at = Math.max(end, after)
    }
  })
  if (at < 1000) out.push({ top: at, bottom: 1000 })
  return out
}

/** Share out the words of `text` over pieces of the given sizes, in reading order. Every piece with room gets a word. */
export function splitAcross(text: string, weights: number[]): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (weights.length <= 1) return [words.join(' ')]
  const total = weights.reduce((a, b) => a + b, 0) || 1
  const lengths = words.map((w) => w.length + 1)
  const chars = lengths.reduce((a, b) => a + b, 0)
  const out: string[] = []
  let from = 0
  let acc = 0
  let weight = 0
  for (let j = 0; j < weights.length; j++) {
    weight += weights[j]!
    if (j === weights.length - 1) {
      out.push(words.slice(from).join(' '))
      break
    }
    const target = (chars * weight) / total
    let to = from
    // take words while that brings the running length closer to the target, leaving a word for each piece to come
    while (to < words.length - (weights.length - 1 - j) && Math.abs(acc + lengths[to]! - target) <= Math.abs(acc - target)) acc += lengths[to++]!
    if (to === from && to < words.length - (weights.length - 1 - j)) acc += lengths[to++]!
    out.push(words.slice(from, to).join(' '))
    from = to
  }
  return out
}

export interface Piece { id: number; x: number; w: number; text: string; ends: boolean }

/** For each text line of a page, the translation pieces under its ayah pieces (right to left). */
export function lineTranslations(pg: MushafPageMap, strips: Strip[], texts: string[]): Map<Strip, Piece[]> {
  const shares = new Map<number, string[]>()
  pg.a.forEach((rects, k) => {
    const id = pg.first + k
    shares.set(id, splitAcross(texts[id - 1] ?? '', rects.map((r) => r[2])))
  })
  const used = new Map<number, number>()
  const out = new Map<Strip, Piece[]>()
  for (const strip of strips) {
    if (!strip.line) continue
    out.set(strip, strip.line.map((s) => {
      const k = used.get(s.id) ?? 0
      used.set(s.id, k + 1)
      const parts = shares.get(s.id) ?? ['']
      return { id: s.id, x: s.x, w: s.w, text: parts[k] ?? '', ends: k === parts.length - 1 }
    }))
  }
  return out
}
