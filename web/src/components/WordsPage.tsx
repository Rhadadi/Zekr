import { Fragment } from 'preact'
import { memo } from 'preact/compat'
import { type Meta, loadWbw, locate, pageRange } from '../data'
import { useAsync } from '../hooks'
import { num, t } from '../i18n'
import { Loading } from './Page'
import { SurahBanner } from './SurahBanner'

interface Props {
  meta: Meta
  n: number
  basmala: string
  size: number
  trSize: number
  highlight?: number
  kind?: 'sel' | 'playing'
}

const marker = (n: number) => `﴿${num(n)}﴾`
const COLOURS = 5

/** One page word by word: each Arabic word with its Persian meaning right under it, in the same colour, so the eye
 * pairs them; consecutive words take different colours. The lines are justified like a mushaf page. Tap any word for
 * its ayah. */
export const WordsPage = memo(function WordsPage({ meta, n, basmala, size, trSize, highlight, kind }: Props) {
  const { first, last } = pageRange(meta, n)
  const surahs = [...new Set(Array.from({ length: last - first + 1 }, (_, i) => locate(meta, first + i).surah))]
  const data = useAsync(() => Promise.all(surahs.map((s) => loadWbw(s))), [n])
  if (!data.value) return <section class="mpage wbw" id={`page-${n}`} data-page={n}><Loading /></section>

  const bySurah = new Map(surahs.map((s, i) => [s, data.value![i]!]))
  const out: preact.ComponentChildren[] = []
  let run: preact.ComponentChildren[] = []
  let colour = 0
  const flush = () => {
    if (run.length) out.push(<p class="wflow" dir="rtl" key={`f${out.length}`} style={{ fontSize: `${size}px` }}>{run}</p>)
    run = []
  }
  for (let id = first; id <= last; id++) {
    const at = locate(meta, id)
    if (at.ayah === 1) {
      flush()
      out.push(<SurahBanner key={`b${at.surah}`} name={meta.surahs[at.surah - 1]!.ar} />)
      if (at.surah !== 1 && at.surah !== 9) out.push(<p class="basmala" lang="ar" dir="rtl" key={`s${at.surah}`} style={{ fontSize: `${size}px` }}>{basmala}</p>)
    }
    const words = bySurah.get(at.surah)?.[at.ayah - 1] ?? []
    run.push(
      <span key={id} class={`ay${highlight === id ? ` ${kind}` : ''}`} data-id={id} role="button" tabIndex={0} aria-label={`${at.surah}:${at.ayah}`}>
        {words.map(([ar, fa], k) => (
          <Fragment key={k}>
            <span class={`wb c${colour++ % COLOURS}`}>
              <span class="wb-ar" lang="ar">{ar}</span>
              <span class="wb-fa" lang="fa" style={{ fontSize: `${trSize}px` }}>{fa}</span>
            </span>{' '}
          </Fragment>
        ))}
        <span class="wb wb-mark"><span class="mark" lang="ar">{marker(at.ayah)}</span></span>
      </span>,
      ' ',
    )
  }
  flush()
  return (
    <section class="mpage wbw" id={`page-${n}`} data-page={n} aria-label={t('pageN', { n })}>
      {out}
      <div class="page-no" aria-hidden="true"><span>{num(n)}</span></div>
    </section>
  )
})
