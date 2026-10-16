import { useState } from 'preact/hooks'
import { playCommentary, player, toggle } from '../audio'
import { Icon } from './Icon'
import { lang, num, t } from '../i18n'
import { type Meta, locate } from '../data'
import { useAsync } from '../hooks'
import { href } from '../router'
import { entriesForAyah, loadAllStudyEntries, loadStudyTafsir, searchStudyEntries,
  type StudyEntry } from '../studyQuran'

export function Paragraphs({ text }: { text: string }) {
  return <>{text.split(/\n\n+/).map((p, i) => <p key={i}>{p}</p>)}</>
}
export function Note({ entry, queue }: { entry: StudyEntry; queue?: StudyEntry[] }) {
  const range = entry.first_ayah === entry.last_ayah ? String(entry.first_ayah) : `${entry.first_ayah}–${entry.last_ayah}`
  const active = player.value?.commentary?.id === entry.id
  const playing = active && (player.value?.status === 'playing' || player.value?.status === 'loading')
  return <section class="study-note" data-entry={entry.id} lang="en" dir="ltr">
    <h4>{entry.coverage_kind === 'quoted_header' ? 'Source passage' : 'Commentary'} · {entry.surah_id}:{range}</h4>
    {entry.audio ? <div class="study-audio" lang={lang.value} dir={lang.value === 'fa' ? 'rtl' : 'ltr'}>
      <button class="btn" onClick={() => active ? toggle() : playCommentary(entry, queue)}
        aria-label={`${playing ? t('pause') : t('listenCommentary')} · ${entry.surah_id}:${range}`}>
        <Icon name={playing ? 'pause' : 'play'} size={18} /> {playing ? t('pause') : t('listenCommentary')}
      </button>
      <span class="muted small">{t('commentaryAudio')} · {entry.audio.voice} · {t('aiVoice')}</span>
    </div> : null}
    <Paragraphs text={entry.text} />
    <p class="muted small">The Study Quran · PDF {entry.pages.length === 1 ? 'page' : 'pages'} {entry.pages.join(', ')}</p>
    {entry.references.length ? <nav class="study-refs" aria-label="Quran cross-references">
      {entry.references.map((r, i) => <a key={i} href={r.target_kind === 'introduction' ? href.verse(r.target_surah) : href.verse(r.target_surah, r.first_ayah!)}>{r.raw.replace(/^,\s*/, '')}</a>)}
    </nav> : null}
  </section>
}

/** One chip per commentary group: "Commentary on 2:1–5". On a verse row it shows only at the first ayah of a group; in the
 * ayah panel (`all`) it shows every note that covers the ayah. Notes shared by several ayahs are one chip, one note. */
export function StudyChips({ meta, ayahID, all = false }: { meta: Meta; ayahID: number; all?: boolean }) {
  const { surah, ayah } = locate(meta, ayahID)
  const data = useAsync(async () => (meta.studyQuran ? loadStudyTafsir(meta, surah) : null), [surah, meta.version])
  if (!meta.studyQuran || !data.value) return null
  const entries = entriesForAyah(data.value, ayahID).filter((e) => all || e.first_ayah === ayah)
  if (!entries.length) return null
  return (
    <div class="study-chips">
      {entries.map((e) => (
        <a key={e.id} class="study-chip" href={href.commentary(surah, e.first_ayah)} data-entry={e.id}>
          <Icon name="speech" size={16} />
          {t('commentaryOn')} {num(`${surah}:${rangeLabel(e)}`)}
        </a>
      ))}
    </div>
  )
}

/** In an ayah's list of actions: the Study Quran's commentary on it, when the book has a note on it. */
export function StudyLink({ meta, ayahID }: { meta: Meta; ayahID: number }) {
  const { surah, ayah } = locate(meta, ayahID)
  const data = useAsync(async () => (meta.studyQuran ? loadStudyTafsir(meta, surah) : null), [surah, meta.version])
  if (!meta.studyQuran || !data.value || !entriesForAyah(data.value, ayahID).length) return null
  return (
    <a href={href.commentary(surah, ayah)}>
      <Icon name="speech" size={18} /> {t('commentary')}: {t('studyQuranName')}
    </a>
  )
}

/** The row at the top of a surah that opens the introduction. */
export function StudyIntroLink({ meta, surah }: { meta: Meta; surah: number }) {
  if (!meta.studyQuran) return null
  return (
    <a class="study-intro-link" href={href.intro(surah)}>
      <Icon name="book" size={22} />
      <span>
        <strong>{t('aboutSurah')}</strong>
        <small class="muted">{t('studyQuranName')}</small>
      </span>
      <span class="chev-fwd"><Icon name="chevron" size={18} /></span>
    </a>
  )
}

export function StudySearchPanel({ meta, query }: { meta: Meta; query: string }) {
  const [open, setOpen] = useState(false)
  const hasQuery = !!query.trim()
  const data = useAsync(async () => open && hasQuery ? loadAllStudyEntries(meta) : null,[open,hasQuery,meta.version])
  if (!meta.studyQuran) return null
  const found = data.value && hasQuery ? searchStudyEntries(data.value,query) : null
  return <details class="study-panel" lang="en" dir="ltr" onToggle={(e) => setOpen(e.currentTarget.open)}>
    <summary>Search The Study Quran tafsir</summary>
    {open ? !hasQuery ? <p>Enter search words above.</p> : data.error ? <p role="alert">Could not load commentary. <button onClick={data.retry}>Retry</button></p>
      : data.loading ? <p role="status">Loading commentary for search…</p> : found ? <>
        <p role="status">{found.total} commentary entries found{found.total > found.entries.length ? `; showing ${found.entries.length}` : ''}.</p>
        {found.entries.map((entry) => <div key={entry.id}><a href={href.verse(entry.surah_id,entry.first_ayah)}>Open {entry.surah_id}:{entry.first_ayah}</a><Note entry={entry} queue={data.value!} /></div>)}
      </> : null : null}
  </details>
}

export const rangeLabel = (e: StudyEntry) => (e.first_ayah === e.last_ayah ? String(e.first_ayah) : `${e.first_ayah}–${e.last_ayah}`)
