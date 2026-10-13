import { Note, Paragraphs, rangeLabel } from '../components/StudyQuranPanel'
import { LoadError, Loading, PageHeader } from '../components/Page'
import { type Meta, ayahIdOf } from '../data'
import { useAsync } from '../hooks'
import { ayahRef, surahName, t } from '../i18n'
import { href } from '../router'
import { entriesForAyah, loadStudyIntroduction, loadStudyTafsir } from '../studyQuran'

/** The Study Quran's commentary for an ayah: every note that covers it, with a strip of the ayahs they explain. */
export function CommentaryView({ meta, surah, ayah }: { meta: Meta; surah: number; ayah: number }) {
  const s = meta.surahs[surah - 1]!
  const id = ayahIdOf(meta, surah, Math.min(ayah, s.ayahs))
  const data = useAsync(async () => loadStudyTafsir(meta, surah), [surah, meta.version])
  const entries = data.value ? entriesForAyah(data.value, id) : []
  const first = entries.length ? Math.min(...entries.map((e) => e.first_ayah)) : ayah
  const last = entries.length ? Math.max(...entries.map((e) => e.last_ayah)) : ayah
  // the notes just before and after this stretch, in the book's order
  const all = data.value?.entries ?? []
  const prev = [...all].reverse().find((e) => e.last_ayah < first)
  const next = all.find((e) => e.first_ayah > last)
  const strip = Array.from({ length: Math.min(last - first + 1, 60) }, (_, i) => first + i)
  return (
    <>
      <PageHeader title={t('commentary')} sub={`${t('studyQuranName')} · ${ayahRef(s, ayah)}`} back={href.ayah(surah, ayah)} />
      {data.error ? <LoadError retry={data.retry} /> : !data.value ? <Loading /> : (
        <article class="commentary" lang="en" dir="ltr">
          <section class="comm-strip" aria-label={t('showAyahs')}>
            <strong>{surahName(s)} {first === last ? first : `${first}–${last}`}</strong>
            <div class="comm-nums">
              {strip.map((n) => (
                <a key={n} href={href.verse(surah, n)} class={n === ayah ? 'on' : ''} aria-current={n === ayah ? 'true' : undefined} aria-label={ayahRef(s, n)}>{n}</a>
              ))}
            </div>
          </section>
          {entries.length ? entries.map((e) => <Note key={e.id} entry={e} />) : <p class="muted">{t('noCommentary')}</p>}
          <nav class="comm-pager" aria-label={t('commentary')}>
            {prev ? <a href={href.commentary(surah, prev.first_ayah)}>‹ {t('prevNote')} · {surah}:{rangeLabel(prev)}</a> : <span />}
            {next ? <a href={href.commentary(surah, next.first_ayah)}>{t('nextNote')} · {surah}:{rangeLabel(next)} ›</a> : <span />}
          </nav>
        </article>
      )}
    </>
  )
}

/** The Study Quran's introduction to a surah, on its own screen. */
export function IntroView({ meta, surah }: { meta: Meta; surah: number }) {
  const s = meta.surahs[surah - 1]!
  const data = useAsync(async () => loadStudyIntroduction(meta, surah), [surah, meta.version])
  return (
    <>
      <PageHeader title={t('aboutSurah')} sub={`${t('studyQuranName')} · ${surahName(s)}`} back={href.surah(surah)} />
      {data.error ? <LoadError retry={data.retry} /> : !data.value ? <Loading /> : (
        <article class="commentary" lang="en" dir="ltr">
          <Paragraphs text={data.value.text} />
          <p class="muted small">PDF {data.value.pages.length === 1 ? 'page' : 'pages'} {data.value.pages.join(', ')}</p>
          <a class="btn primary comm-start" href={href.verse(surah, 1)}>{t('startReadingAt')} {surah}:1</a>
        </article>
      )}
    </>
  )
}
