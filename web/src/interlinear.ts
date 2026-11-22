// Translation under each line of a printed page. The page picture is cut into its lines (and the parts between them:
// the frame, surah banners, basmala), and under every line of text comes the translation of what is on that line.
// We know where each ayah sits on each line (map.json), so an ayah's translation is shared out over its lines in
// proportion to how much of each line it takes, and its number ends up under the Arabic ayah number.
import type { MushafPageMap } from './data'

export interface Seg { id: number; x: number; y: number; w: number; h: number }
/** A horizontal slice of the page picture, in thousandths of its height. `line` holds the ayah pieces on a text line. */
export interface Strip { top: number; bottom: number; line?: Seg[] }

/** Cut a page into strips: one per line of text (with its ayah pieces, right to left), and the parts in between. With
 * the ink of the picture's rows (`pageInk`), a line followed by a surah banner ends just above the banner's border,
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

export interface TranslationWord { id: number; text: string; ends: boolean; home: number }

/** Reflow whole words across neighbouring lines, keeping their ayah identity and order. */
export function translationWords(rows: Piece[][]): TranslationWord[] {
  return rows.flatMap((row, home) => row.flatMap(piece => {
    const words = piece.text.split(/\s+/).filter(Boolean)
    if (!words.length) return piece.ends ? [{ id: piece.id, text: '', ends: true, home }] : []
    return words.map((text, i) => ({ id: piece.id, text, ends: piece.ends && i === words.length - 1, home }))
  }))
}

/** Balance a block between banners. Line ends are soft anchors; no text crosses a surah heading. */
export function balanceTranslationRows(rows: Piece[][], widths: number[]): Piece[][] {
  const tokens = translationWords(rows)
  const count = rows.length
  if (!tokens.length || count < 2) return rows
  if (widths.length !== tokens.length || widths.some(width => !Number.isFinite(width) || width < 0)) throw new Error('Translation word measurements differ')
  const sums = [0]
  for (const width of widths) sums.push(sums.at(-1)! + width)
  const target = Math.max(1, sums.at(-1)! / count)
  const ceiling = Math.max(...widths, target * 2)
  const each = tokens.length >= count ? 1 : 0
  let costs = new Float64Array(tokens.length + 1).fill(Infinity)
  costs[0] = 0
  const breaks: Int32Array[] = []
  for (let row = 0; row < count; row++) {
    const next = new Float64Array(tokens.length + 1).fill(Infinity)
    const from = new Int32Array(tokens.length + 1).fill(-1)
    const drift = [0]
    for (const token of tokens) drift.push(drift.at(-1)! + Math.max(0, Math.abs(token.home - row) - 1) ** 2)
    for (let end = (row + 1) * each; end <= tokens.length - (count - row - 1) * each; end++) {
      for (let start = end - each; start >= row * each; start--) {
        const width = sums[end]! - sums[start]!
        if (width > ceiling) break
        if (!Number.isFinite(costs[start])) continue
        const last = tokens[end - 1]
        const punctuation = last?.ends || /[.،؛:!?؟]$/.test(last?.text ?? '') ? 0 : .025
        const cost = costs[start]! + ((width - target) / target) ** 2 * 6 + (drift[end]! - drift[start]!) * .015 + punctuation
        if (cost < next[end]!) { next[end] = cost; from[end] = start }
      }
    }
    breaks.push(from)
    costs = next
  }
  if (!Number.isFinite(costs[tokens.length])) return rows
  const result: Piece[][] = Array.from({ length: count }, () => [])
  let end = tokens.length
  for (let row = count - 1; row >= 0; row--) {
    const start = breaks[row]![end]!
    for (const token of tokens.slice(start, end)) {
      const previous = result[row]!.at(-1)
      if (previous?.id === token.id && !previous.ends) {
        previous.text += `${previous.text && token.text ? ' ' : ''}${token.text}`
        previous.ends = token.ends
      } else result[row]!.push({ id: token.id, x: 0, w: 0, text: token.text, ends: token.ends })
    }
    end = start
  }
  return result
}

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

/** Where the paper inside the frame begins and ends, in fractions of the picture's width, from how much of each column
 * is ink (0 to 1). Going out from the text, the first column that is mostly ink is the frame: either its band, or a thin
 * rule a pixel or two inside the band with a column of paper between them. The rule is taken into the paper (a
 * translation's row, the line's strip stretched, would draw it as a bar beside the words); the band is not. */
export function paperEdges(cols: ArrayLike<number>): { left: number; right: number } | undefined {
  const w = cols.length
  const side = (from: number, to: number, step: 1 | -1) => {
    for (let x = from; x !== to; x += step) {
      if (cols[x]! <= 0.6) continue
      for (let g = x + step, k = 0; k < 4 && g !== to; g += step, k++) {
        if (cols[g]! < 0.25) return (cols[g + step] ?? 0) > 0.6 ? g : x
      }
      return x
    }
    return undefined
  }
  const l = side(Math.round(w * 0.12), Math.round(w * 0.03), -1)
  const r = side(Math.round(w * 0.88), Math.round(w * 0.97), 1)
  if (l === undefined || r === undefined) return undefined
  // the paper covers the gap column itself (it is paper), and nothing of the band
  const left = cols[l]! > 0.6 ? l + 1 : l
  const right = cols[r]! > 0.6 ? r : r + 1
  return { left: left / w, right: right / w }
}

const frames = new Map<string, Promise<{ left: number; right: number } | undefined>>()

/** The paper's edges inside a page's frame (`paperEdges`), once a picture. */
export function pageFrame(src: string): Promise<{ left: number; right: number } | undefined> {
  let p = frames.get(src)
  if (!p) {
    p = new Promise((resolve) => {
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
        // the paper: the colour in the middle of the page, between the lines (the lightest of a few samples)
        let best = -1
        let paper = [255, 255, 255]
        for (let y = Math.round(h * 0.3); y < h * 0.7; y += 11) {
          const i = (y * w + Math.round(w / 2)) * 4
          const lum = d[i]! + d[i + 1]! + d[i + 2]!
          if (lum > best) { best = lum; paper = [d[i]!, d[i + 1]!, d[i + 2]!] }
        }
        const y0 = Math.round(h * 0.1)
        const y1 = Math.round(h * 0.95)
        const cols = new Float32Array(w)
        for (let x = 0; x < w; x++) {
          let n = 0
          for (let y = y0; y < y1; y++) {
            const i = (y * w + x) * 4
            if (Math.abs(d[i]! - paper[0]!) + Math.abs(d[i + 1]! - paper[1]!) + Math.abs(d[i + 2]! - paper[2]!) > 60) n++
          }
          cols[x] = n / (y1 - y0)
        }
        resolve(paperEdges(cols))
      }
      img.onerror = () => resolve(undefined)
      img.src = src
    })
    frames.set(src, p)
  }
  return p
}

const inks = new Map<string, Promise<Float32Array | undefined>>()

/** For each row of pixels of a page's picture, how much of it inside the frame is ink: a surah banner's border is a row
 * of ink from side to side, and a line of text is never more than about 60% ink. Ink is what differs from the paper;
 * most of what is inside the frame is paper and the ink is darker, so the colour a quarter of the way down from the
 * lightest is paper. Once a picture. */
export function pageInk(src: string): Promise<Float32Array | undefined> {
  let ink = inks.get(src)
  if (!ink) {
    ink = new Promise((resolve) => {
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
        const [r, gr, b] = [d[at]!, d[at + 1]!, d[at + 2]!]
        const rows = new Float32Array(h)
        for (let y = 0; y < h; y++) {
          let n = 0
          for (let x = x0; x < x1; x++) {
            const i = (y * w + x) * 4
            if (Math.abs(d[i]! - r) + Math.abs(d[i + 1]! - gr) + Math.abs(d[i + 2]! - b) > 60) n++
          }
          rows[y] = n / (x1 - x0)
        }
        resolve(rows)
      }
      img.onerror = () => resolve(undefined)
      img.src = src
    })
    inks.set(src, ink)
  }
  return ink
}

/** The colour of the paper in each band of a page's picture (thousandths), for the cover a line in a font sits on:
 * the lighter half of the band's pixels (the ink is the rest), averaged. */
const papers = new Map<string, Promise<string[] | undefined>>()
export function bandPaper(src: string, bands: { top: number; bottom: number; left: number; right: number }[]): Promise<string[] | undefined> {
  const key = `${src}#${bands.map((b) => b.top).join(',')}`
  let p = papers.get(key)
  if (!p) {
    p = new Promise((resolve) => {
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
        resolve(bands.map((b) => {
          const px: [number, number, number][] = []
          for (let y = Math.round((b.top / 1000) * h) + 1; y < (b.bottom / 1000) * h - 1; y += 3) {
            for (let x = Math.round((b.left / 1000) * w) + 2; x < (b.right / 1000) * w - 2; x += 5) {
              const i = (y * w + x) * 4
              px.push([d[i]!, d[i + 1]!, d[i + 2]!])
            }
          }
          px.sort((a, c) => c[0] + c[1] + c[2] - (a[0] + a[1] + a[2]))
          const light = px.slice(Math.floor(px.length * 0.1), Math.max(1, Math.floor(px.length * 0.5)))
          const avg = [0, 1, 2].map((k) => Math.round(light.reduce((t, q) => t + q[k]!, 0) / Math.max(1, light.length)))
          return `rgb(${avg[0]} ${avg[1]} ${avg[2]})`
        }))
      }
      img.onerror = () => resolve(undefined)
      img.src = src
    })
    papers.set(key, p)
  }
  return p
}
