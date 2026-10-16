// Translation under each line of a printed page. The page picture is cut into its lines (and the parts between them:
// the frame, surah banners, basmala), and under every line of text comes the translation of what is on that line.
// We know where each ayah sits on each line (map.json), so an ayah's translation is shared out over its lines in
// proportion to how much of each line it takes, and its number ends up under the Arabic ayah number.
import type { MushafPageMap } from './data'

export interface Seg { id: number; x: number; y: number; w: number; h: number }
/** A horizontal slice of the page picture, in thousandths of its height. `line` holds the ayah pieces on a text line. */
export interface Strip { top: number; bottom: number; line?: Seg[] }

/** Cut a page into strips: one per line of text (with its ayah pieces, right to left), and the parts in between. With
 * the ink of the picture's rows (`pageLook`), a line followed by a surah banner ends just above the banner's border,
 * which on the map can reach a little way up into the line. */
export function pageStrips(pg: MushafPageMap, ink?: Float32Array): Strip[] {
  const border = (from: number, to: number) => {
    if (!ink) return undefined
    for (let r = Math.ceil((from / 1000) * ink.length); r <= (to / 1000) * ink.length; r++) {
      if (ink[r]! > 0.85) return Math.floor((r * 1000) / ink.length) - 1
    }
    return undefined
  }
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
      const end = Math.max(top + 1, Math.min(bottom + 2, 1000, border(bottom - 14, bottom + 2) ?? 1000))
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

const looks = new Map<string, Promise<PageLook | undefined>>()

/** What the picture of a page shows that the map does not: the colour of its paper (for the space the translation takes
 * inside the frame) and, for each row of pixels, how much of it inside the frame is ink (a surah banner's border is a row
 * of ink from side to side; a line of text is never more than about 60% ink). Most of what is inside the frame is paper and the ink is darker, so the colour a quarter of
 * the way down from the lightest is paper. Once a picture. */
export interface PageLook { paper: string; ink: Float32Array }
export function pageLook(src: string): Promise<PageLook | undefined> {
  let look = looks.get(src)
  if (!look) {
    look = new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const w = img.naturalWidth
        const h = img.naturalHeight
        const g = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
        if (!g || !w || !h) return resolve(undefined)
        g.canvas.width = w
        g.canvas.height = h
        g.drawImage(img, 0, 0)
        const d = g.getImageData(0, 0, w, h).data
        const x0 = Math.round(w * 0.12)
        const x1 = Math.round(w * 0.88)
        const lum = (i: number) => d[i]! + d[i + 1]! + d[i + 2]!
        const sample: number[] = []
        for (let y = Math.round(h * 0.12); y < h * 0.88; y += 7) for (let x = x0; x < x1; x += 7) sample.push((y * w + x) * 4)
        sample.sort((a, b) => lum(b) - lum(a))
        const at = sample[Math.floor(sample.length / 4)]
        if (at === undefined) return resolve(undefined)
        const paper = [d[at]!, d[at + 1]!, d[at + 2]!]
        const ink = new Float32Array(h)
        for (let y = 0; y < h; y++) {
          let n = 0
          for (let x = x0; x < x1; x++) {
            const i = (y * w + x) * 4
            if (Math.abs(d[i]! - paper[0]!) + Math.abs(d[i + 1]! - paper[1]!) + Math.abs(d[i + 2]! - paper[2]!) > 60) n++
          }
          ink[y] = n / (x1 - x0)
        }
        resolve({ paper: `rgb(${paper.join(' ')})`, ink })
      }
      img.onerror = () => resolve(undefined)
      img.src = src
    })
    looks.set(src, look)
  }
  return look
}
