import { Fragment } from 'preact'
import { memo } from 'preact/compat'
import { useLayoutEffect, useMemo, useRef } from 'preact/hooks'
import { type Meta, type MushafPageMap, locate, mushafImage } from '../data'
import { useAsync } from '../hooks'
import { num, t } from '../i18n'
import { type Piece, lineTranslations, pageInk, pageStrips } from '../interlinear'

interface Props {
  meta: Meta
  pg: MushafPageMap
  ar: string[]
  highlight?: number
  kind?: 'sel' | 'playing'
  /** The translation shown under the lines (the first one chosen in Settings). */
  tr: { texts: string[]; dir: 'rtl' | 'ltr'; lang: string; size: number }
  onJump: () => void
}

const marker = (n: number) => `﴿${num(n)}﴾`

/** Make the translation under each line end at the margin, like the Arabic line above it: at the preferred size,
 * condensed or expanded by a few percent (too little to notice, so a page reads at one size) when that makes its last
 * line full, and justified. A line whose translation cannot be fitted that way keeps a short last line. */
function fit(root: HTMLElement, base: number) {
  for (const row of root.querySelectorAll<HTMLElement>('.il-tr:not(.il-under) .il-p')) {
    const text = row.querySelector<HTMLElement>('.il-t')
    if (!text) continue
    row.style.fontSize = '20px'
    row.classList.add('measuring')
    const natural = text.getBoundingClientRect().width // all of it on one line, at 20px
    row.classList.remove('measuring')
    const width = row.clientWidth
    if (!natural || !width) continue
    const n = (natural * base) / 20 / width // lines it takes at the preferred size
    const shrink = (Math.floor(n) / n) * 0.975
    const grow = (Math.ceil(n) / n) * 0.975
    let size = base
    let fills = n - Math.floor(n) >= 0.7 // a nearly full last line can be justified as it is
    if (n >= 1 && shrink >= 0.93) {
      size = base * shrink
      fills = true
    } else if (grow <= 1.07) {
      size = base * grow
      fills = true
    }
    row.style.fontSize = `${size.toFixed(2)}px`
    row.classList.toggle('fills', fills)
    // word wrapping can push a word onto an extra line: shrink a touch until it is back
    const lines = Math.max(1, Math.round((n * base) / size))
    for (let k = 0; fills && k < 4 && row.getBoundingClientRect().height > lines * size * 1.6 + size * 0.6; k++) {
      size *= 0.98
      row.style.fontSize = `${size.toFixed(2)}px`
    }
  }
}

/** A printed page with the translation under each of its lines. The picture is cut into its lines (and the banners and
 * basmala between them); under each line is a box inside its frame, where each ayah's share of the
 * translation sits under its Arabic, and where an ayah ends its number comes under the Arabic one. Tap the Arabic or the
 * translation of an ayah to open it. */
export const InterlinearPage = memo(function InterlinearPage({ meta, pg, ar, highlight, kind, tr, onJump }: Props) {
  const n = pg.n
  const src = mushafImage(meta, n)
  const ink = useAsync(() => pageInk(src), [src]).value
  const strips = useMemo(() => pageStrips(pg, ink), [pg, ink])
  const pieces = useMemo(() => lineTranslations(pg, strips, tr.texts), [pg, strips, tr.texts])
  const root = useRef<HTMLElement>(null)
  const ratio = pg.h / pg.w
  const cls = (id: number) => (highlight === id ? ` ${kind}` : '')

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const run = () => fit(el, tr.size)
    run()
    void document.fonts?.ready.then(run)
    const observer = new ResizeObserver(run)
    observer.observe(el)
    return () => observer.disconnect()
  }, [pieces, tr.size])

  // the opening pages are illumination all round a small panel of text, which cannot be stretched: there the picture
  // stays whole and the page's translation comes under it
  const under = n <= 2
  const words = (row: Piece[]) => (
    <p class="il-p">
      <span class="il-t">
        {row.map((p, i) => (
          <span key={`${p.id}-${i}`} class={`ay${cls(p.id)}`} data-id={p.id} aria-hidden="true">
            {p.text}{p.ends ? <span class="il-mark"> {marker(locate(meta, p.id).ayah)}</span> : null}{' '}
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
    <section ref={root} class="mpage printed il" id={`page-${n}`} data-page={n} aria-label={t('pageN', { n })}>
      {strips.map((s) => {
        const h = s.bottom - s.top
        const row = pieces.get(s)
        return (
          <Fragment key={s.top}>
            <div class="il-strip" style={{ paddingTop: `${(h / 1000) * ratio * 100}%` }}>
              <i class="pg-img il-pic" style={slice(s.top, h)} />
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
              // the translation of what is on this line, in its own reading order; an ayah's number comes where it
              // ends, so it is in the same line of the page as the Arabic number
              <div class="il-tr" dir={tr.dir} lang={tr.lang}>
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
        <div class="il-tr il-under" dir={tr.dir} lang={tr.lang} style={{ fontSize: tr.size }}>
          {words(strips.flatMap((s) => pieces.get(s) ?? []))}
        </div>
      ) : null}
    </section>
  )
})
