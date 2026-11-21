import { Fragment } from 'preact'
import { memo } from 'preact/compat'
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { type Meta, type MushafPageMap, loadPageLines, locate, mushafImage, PAGE_TRIM } from '../data'
import { useAsync } from '../hooks'
import { num, t } from '../i18n'
import { type Piece, type Strip, balanceTranslationRows, translationWords, bandPaper, lineTranslations, pageInk, pageStrips } from '../interlinear'
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
    row.dataset.small = String(size < 12)
  }
}

/** Printed Arabic with one continuous translation line between rows. Text can borrow neighbouring rows within
 * a surah; each piece keeps its ayah identity, so tapping opens the complete translation at reading size. */
export const InterlinearPage = memo(function InterlinearPage({ meta, pg, ar, highlight, kind, tr, font = false, onJump }: Props) {
  const n = pg.n
  const src = mushafImage(meta, n)
  const ink = useAsync(() => pageInk(src), [src]).value
  const strips = useMemo(() => pageStrips(pg, ink), [pg, ink])
  const pieces = useMemo(() => lineTranslations(pg, strips, tr.texts), [pg, strips, tr.texts])
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
          span.textContent = `${token.text}${token.ends ? ` ${num(locate(meta, token.id).ayah)}` : ''} `
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
            {p.text}{p.ends ? <span class="il-mark">{' '}{num(locate(meta, p.id).ayah)}</span> : null}{' '}
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
              <div class="il-tr" data-word-source={tr.id} dir={tr.dir} lang={tr.lang} title={t('enlargeTranslation')}>
                {/* the frame goes on down the sides: the line's own strip of the picture, stretched to the box's height */}
                <i class="pg-img il-pic il-frame" style={slice(s.top, h)} />
                <span class="il-paper" />
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
