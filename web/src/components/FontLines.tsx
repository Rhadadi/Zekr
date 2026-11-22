import { quranText } from '../store'
import { useLayoutEffect } from 'preact/hooks'
import type { MushafPageMap, PageLine } from '../data'
import type { Strip } from '../interlinear'
import { VerseNo } from './VerseNo'

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩'
const arabicNum = (n: number) => String(n).replace(/\d/g, (d) => ARABIC_INDIC[Number(d)] as string)

/** Where a text line sits on the printed page, in thousandths of the picture. */
export interface Band { top: number; bottom: number; left: number; right: number }

/** The bands of a page's text lines, from the strips that hold one. Each reaches across the whole text frame (the widest
 * any line goes), so its cover hides all of the printed line. */
export function textBands(strips: Strip[]): Band[] {
  const lines = strips.filter((s) => s.line?.length)
  if (!lines.length) return []
  const left = Math.min(...lines.flatMap((s) => s.line!.map((g) => g.x)))
  const right = Math.max(...lines.flatMap((s) => s.line!.map((g) => g.x + g.w)))
  return lines.map((s) => ({ top: Math.min(...s.line!.map((g) => g.y)), bottom: Math.max(...s.line!.map((g) => g.y + g.h)), left, right }))
}

// a word's printed width with the space after it, measured in KFGQPC Hafs (the calligraphy of the printed edition)
let ctx: CanvasRenderingContext2D | null | undefined
function width(w: string): number {
  if (ctx === undefined) {
    ctx = document.createElement('canvas').getContext('2d')
    if (ctx) ctx.font = "40px 'Zekr Hafs'"
  }
  return ctx ? ctx.measureText(`${w} `).width : w.length + 1
}

/** Wait for the font the words are measured in. */
export const hafsReady = () => document.fonts?.load("40px 'Zekr Hafs'").then(() => undefined) ?? Promise.resolve()

/** The page's words line by line as this edition prints them. The words come by ayah (the layout file's own line
 * breaks are another printing's); the page map says how much of each line every ayah takes, so each ayah's words are
 * shared out over its lines in those proportions, its number at its end. Undefined when the ayahs do not match. */
export function layoutLines(pg: MushafPageMap, strips: Strip[], page: PageLine[]): PageLine[] | undefined {
  const ayahs: { words: string[]; n: number }[] = []
  let words: string[] = []
  for (const t of page.flat()) {
    if (typeof t === 'number') { ayahs.push({ words, n: t }); words = [] } else words.push(t)
  }
  if (ayahs.length !== pg.a.length) return undefined
  const parts = new Map<string, PageLine>()
  const medallion = (h: number) => (h * pg.h * 0.9) / pg.w
  pg.a.forEach((rects, k) => {
    const { words: ws, n } = ayahs[k]!
    const order = [...rects].sort((a, b) => a[1] - b[1] || b[0] - a[0]) // top line first, right to left
    const room = order.map(([, , w, h], j) => Math.max(1, j === order.length - 1 ? w - medallion(h) : w))
    const total = room.reduce((a, b) => a + b, 0)
    const sizes = ws.map(width)
    const all = sizes.reduce((a, b) => a + b, 0)
    let used = 0
    const out: PageLine[] = order.map(() => [])
    ws.forEach((w, i) => {
      const mid = (used + sizes[i]! / 2) / all // where the middle of the word falls in the ayah
      used += sizes[i]!
      let acc = 0
      let j = 0
      while (j < order.length - 1 && mid > (acc + room[j]!) / total) acc += room[j++]!
      out[j]!.push(w)
    })
    out[out.length - 1]!.push(n)
    order.forEach(([x, y], j) => parts.set(`${pg.first + k}:${x}:${y}`, out[j]!))
  })
  return strips.filter((s) => s.line?.length).map((s) => s.line!.flatMap((g) => parts.get(`${g.id}:${g.x}:${g.y}`) ?? []))
}

/** One line of the printed page in the chosen Quran font, over the same line of the picture: a cover the colour of
 * the paper under it, and the line's words spread from margin to margin as printed. `box` is the part of the picture
 * the line is placed in (the whole page, or one strip of it). */
export function FontLine({ tokens, band, box, paper }: { tokens: PageLine; band: Band; box: { top: number; bottom: number }; paper?: string }) {
  const h = box.bottom - box.top
  return (
    <div class="fl" aria-hidden="true" style={{
      left: `${band.left / 10}%`, width: `${(band.right - band.left) / 10}%`,
      // a little taller than the line, to hide the tips of the printed letters above and below it
      top: `${((band.top - 7 - box.top) / h) * 100}%`, height: `${((band.bottom - band.top + 10) / h) * 100}%`, background: paper,
    }}>
      <p class="fl-t" lang="ar" dir="rtl">
        {tokens.map((t, i) => (typeof t === 'number' ? <span key={i} class="fl-n"><VerseNo n={arabicNum(t)} /></span> : <span key={i}>{quranText(t)}</span>))}
      </p>
    </div>
  )
}

/** One font size for the whole page, the largest at which its longest line still fits, so every line reads at the same
 * size, as printed; it follows the page's size. A line much shorter than the frame is centred rather than stretched. */
export function useFontLinesFit(root: { current: HTMLElement | null }, deps: unknown[]) {
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const run = () => {
      const lines = [...el.querySelectorAll<HTMLElement>('.fl-t')].filter((p) => p.childElementCount) // not the bare covers
      if (!lines.length) return
      el.style.setProperty('--fl-size', '20px')
      let ratio = Infinity
      for (const p of lines) {
        p.classList.remove('short')
        p.classList.add('measuring')
        const natural = p.offsetWidth // its words side by side at 20px
        p.classList.remove('measuring')
        if (natural > 0) {
          const r = p.parentElement!.clientWidth / natural
          if (r < 3) ratio = Math.min(ratio, r) // a line of a word or two does not set the size
          else p.classList.add('short')
        }
      }
      const band = lines[0]!.parentElement!.clientHeight
      const size = Math.min(20 * (Number.isFinite(ratio) ? ratio : 1) * 0.97, band * 0.74)
      el.style.setProperty('--fl-size', `${size.toFixed(2)}px`)
    }
    run()
    void document.fonts?.ready.then(run)
    const observer = new ResizeObserver(run)
    observer.observe(el)
    return () => observer.disconnect()
  }, deps)
}
