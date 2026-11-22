import { Fragment } from 'preact'
import { memo } from 'preact/compat'
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { type Meta, type MushafPageMap, loadPageLines, locate, mushafImage, PAGE_TRIM } from '../data'
import { useAsync } from '../hooks'
import { num, t } from '../i18n'
import { type Piece, type Strip, balanceTranslationRows, translationWords, bandPaper, lineTranslations, pageFrame, pageInk, pageStrips } from '../interlinear'
import { FontLine, hafsReady, layoutLines, textBands, useFontLinesFit } from './FontLines'

interface Props {
  meta: Meta
  pg: MushafPageMap
  ar: string[]
  highlight?: number
  kind?: 'sel' | 'playing'
  /** The translation shown under the lines (the first one chosen in Settings). */
  tr: { id: string; texts: string[]; dir: 'rtl' | 'ltr'; lang: string; size: number }
  /** The text in the chosen Quran font over each line of the picture, instead of the picture's own text. */
  font?: boolean
  onJump: () => void
}

/** Use the font's designed width axis before reducing type size. Every row remains one complete line. */
function fit(root: HTMLElement, base: number) {
  for (const row of root.querySelectorAll<HTMLElement>('.il-tr:not(.il-under) .il-p')) {
    const text = row.querySelector<HTMLElement>('.il-t')
    if (!text) continue
    const width = row.clientWidth
    if (!width) continue
    row.style.fontSize = '20px'
    text.style.wordSpacing = ''
    let natural = 0
    for (const stretch of [100, 87.5, 75, 62.5]) {
      row.style.fontStretch = `${stretch}%`
      natural = text.getBoundingClientRect().width
      if (natural * base / 20 <= width - 1) break
    }
    let size = natural ? Math.min(base, (width - 2) * 20 / natural) : base
    const apply = () => { row.style.fontSize = `${Math.max(1, Math.floor(size * 100) / 100)}px` }
    apply()
    // Hinting and fallback fonts can change advances nonlinearly at small sizes, especially across platforms.
    for (let attempt = 0; attempt < 5; attempt++) {
      const actual = text.getBoundingClientRect().width
      if (actual <= width - .5) break
      size *= (width - 2) / actual
      apply()
    }
    // a row shorter than the line (a terser translation) fills it: a little larger type first, then wider spaces between
    // words, each within bounds, so no row ends far short of the frame and none has gaps in it
    let actual = text.getBoundingClientRect().width
    if (actual < width - 3 && actual > 0 && row.style.fontStretch === '100%') {
      size = Math.min(base * 1.12, size * ((width - 2) / actual))
      apply()
      actual = text.getBoundingClientRect().width
    }
    const gaps = (text.textContent?.trim().match(/\s+/g) ?? []).length
    if (gaps && actual < width - 3) text.style.wordSpacing = `calc(-0.02em + ${Math.min((width - 2 - actual) / gaps, size * 0.45).toFixed(2)}px)`
    row.dataset.small = String(size < 12)
  }
}

/** Printed Arabic with one continuous translation line between rows. Text can borrow neighbouring rows within
 * a surah; each piece keeps its ayah identity, so tapping opens the complete translation at reading size. */
export const InterlinearPage = memo(function InterlinearPage({ meta, pg, ar, highlight, kind, tr, font = false, onJump }: Props) {
  const n = pg.n
  const src = mushafImage(meta, n)
  const ink = useAsync(() => pageInk(src), [src]).value
  const frame = useAsync(() => pageFrame(src), [src]).value
  const paperBox = frame ? { left: `${frame.left * 100}%`, right: `${(1 - frame.right) * 100}%` } : undefined
  const strips = useMemo(() => pageStrips(pg, ink), [pg, ink])
  const pieces = useMemo(() => lineTranslations(pg, strips, tr.texts), [pg, strips, tr.texts])
  // Under a translation, the page's own paper: a few rows of the picture with no ink on them (between two printed lines),
  // stretched to the row's height. Every column of such rows is the same all the way down, so stretched it is the paper
  // and the frame's thin rule exactly as printed, as if the translation were written on the page. It is shown from the
  // frame's band inwards (paperEdges); the band beside it is the line's own strip, stretched.
  const clean = useMemo(() => {
    if (!ink) return undefined
    const H = ink.length
    const out = new Map<Strip, number>()
    for (const st of strips) {
      if (!st.line) continue
      const from = Math.round((st.bottom / 1000) * H)
      let best = -1
      for (let d = 0; d < 60 && best < 0; d++) {
        for (const y of [from + d, from - d]) {
          if (y < 3 || y > H - 4) continue
          let ok = true
          for (let k = -2; k <= 2 && ok; k++) if (ink[y + k]! > 0.002) ok = false
          if (ok) { best = y; break }
        }
      }
      if (best >= 0) out.set(st, best)
    }
    // a line with none near it borrows one from elsewhere on the page: the paper and the rule are the same all the way down
    const lines = strips.filter((st) => st.line)
    if (out.size < lines.length) {
      const y0 = Math.round(((lines[0]?.top ?? 100) / 1000) * H)
      const y1 = Math.round(((lines.at(-1)?.bottom ?? 900) / 1000) * H)
      let any = -1
      let least = Infinity
      for (let y = Math.max(3, y0); y < Math.min(H - 4, y1); y++) {
        let most = 0
        for (let k = -2; k <= 2; k++) most = Math.max(most, ink[y + k]!)
        if (most < least) { least = most; any = y }
        if (most === 0) break
      }
      if (any >= 0 && least <= 0.002) for (const st of lines) if (!out.has(st)) out.set(st, out.values().next().value ?? any)
    }
    return out
  }, [ink, strips])
  const paperRows = (st: Strip) => {
    const y = clean?.get(st)
    if (y === undefined || !ink || !frame) return undefined
    const H = ink.length
    return { ...slice(((y - 1) / H) * 1000, (3 / H) * 1000), clipPath: `inset(0 ${(1 - frame.right) * 100}% 0 ${frame.left * 100}%)` }
  }
  const [reflow, setReflow] = useState<{ source: typeof pieces; rows: typeof pieces }>()
  const shown = reflow?.source === pieces ? reflow.rows : pieces
  const root = useRef<HTMLElement>(null)
  const ratio = pg.h / pg.w
  // in a font: each line's words over that line of the picture (not the opening pages, nor a page whose lines do not match)
  const bands = useMemo(() => textBands(strips), [strips])
  const page = useAsync(async () => (font && meta.lines && n > 2 ? (await hafsReady(), loadPageLines(meta, n)) : undefined), [font, n])
  const laid = useMemo(() => (page.value ? layoutLines(pg, strips, page.value) : undefined), [page.value, pg, strips])
  const fonted = !!laid && laid.length === bands.length
  const paper = useAsync(async () => (fonted ? bandPaper(src, bands) : undefined), [fonted, src, bands])
  useFontLinesFit(root, [fonted, n, bands])
  let lineNo = -1
  const lineOf = useMemo(() => new Map(strips.filter((st) => st.line?.length).map((st, i) => [st, i])), [strips])
  const cls = (id: number) => (highlight === id ? ` ${kind}` : '')

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    let disposed = false
    let lastWidth = -1
    const balance = () => {
      if (disposed) return
      const width = el.clientWidth
      if (!width || width === lastWidth) return
      lastWidth = width
      const next = new Map<Strip, Piece[]>()
      let block: Strip[] = []
      const flush = () => {
        if (!block.length) return
        const rows = block.map(strip => pieces.get(strip) ?? [])
        const probe = document.createElement('span')
        probe.className = 'il-measure'
        probe.setAttribute('aria-hidden', 'true')
        const tokens = translationWords(rows)
        for (const token of tokens) {
          const span = document.createElement('span')
          span.textContent = `${token.text} `
          if (token.ends) {
            const mark = document.createElement('span')
            mark.className = 'il-mark'
            mark.textContent = num(locate(meta, token.id).ayah)
            span.append(mark, ' ')
          }
          probe.append(span)
        }
        el.append(probe)
        const widths = Array.from(probe.children, child => child.getBoundingClientRect().width)
        probe.remove()
        balanceTranslationRows(rows, widths).forEach((row, i) => next.set(block[i]!, row))
        block = []
      }
      for (const strip of strips) { if (strip.line) block.push(strip); else flush() }
      flush()
      setReflow({ source: pieces, rows: next })
    }
    // Measure the actual Persian glyphs, rather than estimating width from character counts.
    const fontReady = () => { lastWidth = -1; balance() }
    void document.fonts.load('500 20px "Zekr Translation"').then(fontReady, fontReady)
    const observer = new ResizeObserver(balance)
    observer.observe(el)
    return () => { disposed = true; observer.disconnect() }
  }, [pieces])

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    let disposed = false
    const run = () => { if (!disposed) fit(el, tr.size) }
    run()
    void document.fonts.load('500 20px "Zekr Translation"').then(run, run)
    const observer = new ResizeObserver(run)
    observer.observe(el)
    return () => { disposed = true; observer.disconnect() }
  }, [shown, tr.size])

  // the opening pages are illumination all round a small panel of text, which cannot be stretched: there the picture
  // stays whole and the page's translation comes under it
  const under = n <= 2
  const words = (row: Piece[]) => (
    <p class="il-p">
      <span class="il-t">
        {row.map((p, i) => (
          <span key={`${p.id}-${i}`} class="ay" data-id={p.id} aria-hidden="true">
            {p.text}{p.ends ? <>{' '}<span class="il-mark">{num(locate(meta, p.id).ayah)}</span></> : null}{' '}
          </span>
        ))}
      </span>
    </p>
  )
  // a slice of the picture (thousandths of its height, from `top`, `h` high) filling its box: as a background, drawn
  // the same in every browser (Safari on the iPhone put shifted copies of the whole picture in the wrong place)
  const slice = (top: number, h: number) => ({
    backgroundImage: `url("${src}")`,
    backgroundSize: `100% ${(1000 / h) * 100}%`,
    backgroundPosition: `0 ${h < 1000 ? (top / (1000 - h)) * 100 : 0}%`,
  })
  const seen = new Set<number>()
  return (
    <section ref={root} class="mpage printed il" id={`page-${n}`} data-page={n} aria-label={t('pageN', { n })} style={{ '--trim': PAGE_TRIM }}>
      {/* a little wider than the page: the picture's margins outside the frame are cut off, as on the whole page */}
      <div class="il-in">
      {strips.map((s, si) => {
        const h = s.bottom - s.top
        const row = shown.get(s)
        return (
          <Fragment key={s.top}>
            <div class="il-strip" style={{ paddingTop: `${(h / 1000) * ratio * 100}%` }}>
              <i class="pg-img il-pic" style={slice(s.top, h)} />
              {fonted && s.line?.length ? (lineNo++, <FontLine tokens={laid![lineNo]!} band={bands[lineNo]!} box={s} paper={paper.value?.[lineNo]} />) : null}
              {/* the tips of the next line's printed letters reach up into the strip above it (the frame, a banner): hidden too */}
              {fonted && !s.line?.length && strips[si + 1]?.line?.length && h > 14
                ? <FontLine tokens={[]} band={{ ...bands[lineNo + 1]!, top: s.bottom - 7, bottom: s.bottom - 3 }} box={s} paper={paper.value?.[lineNo + 1]} />
                : null}
              {(s.line ?? []).map((seg) => {
                const first = !seen.has(seg.id)
                seen.add(seg.id)
                const at = locate(meta, seg.id)
                return (
                  <i
                    key={`${seg.id}-${seg.y}-${seg.x}`}
                    class={`seg ay${cls(seg.id)}`}
                    data-id={seg.id}
                    style={{ left: `${seg.x / 10}%`, top: `${((seg.y - s.top) / h) * 100}%`, width: `${seg.w / 10}%`, height: `${(seg.h / h) * 100}%` }}
                    {...(first ? { role: 'button', tabIndex: 0, 'aria-label': `${at.surah}:${at.ayah} ${ar[seg.id - 1] ?? ''}` } : { 'aria-hidden': true })}
                  />
                )
              })}
              {n > 2 && s.bottom === 1000 ? <button class="pg-no" aria-hidden="true" tabIndex={-1} onClick={(e) => { e.stopPropagation(); onJump() }} /> : null}
            </div>
            {row && !under ? (
              // The translation flows in reading order; its number marks its own end, even when it borrows a row.
              <div class="il-tr" data-word-source={tr.id} dir={tr.dir} lang={tr.lang}>
                {/* the frame goes on down the sides: the line's own strip of the picture, stretched to the box's height */}
                <i class="pg-img il-pic il-frame" style={slice(s.top, h)} />
                {paperRows(s) ? <i class="pg-img il-pic il-clean" style={paperRows(s)} /> : <span class="il-paper" style={paperBox} />}
                {/* set in a font, the line above is covered in its paper from margin to margin (FontLine), the frame's thin
                    rule with it: the same cover here, so the rule does not show beside the translation alone */}
                {fonted && lineOf.has(s) ? (() => { const b = bands[lineOf.get(s)!]!; return <span class="fl il-cover" aria-hidden="true" style={{ left: `${b.left / 10}%`, width: `${(b.right - b.left) / 10}%`, top: 0, height: '100%', background: paper.value?.[lineOf.get(s)!] }} /> })() : null}
                {words(row)}
              </div>
            ) : null}
          </Fragment>
        )
      })}
      {under ? (
        <div class="il-tr il-under" data-word-source={tr.id} dir={tr.dir} lang={tr.lang} style={{ fontSize: tr.size }}>
          {words(strips.flatMap((s) => pieces.get(s) ?? []))}
        </div>
      ) : null}
      </div>
    </section>
  )
})
