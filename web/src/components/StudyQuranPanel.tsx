import { useState } from 'preact/hooks'
import { type Meta, locate } from '../data'
import { useAsync } from '../hooks'
import { href } from '../router'
import { entriesForAyah, loadAllStudyEntries, loadStudyIntroduction, loadStudyTafsir, searchStudyEntries,
  type StudyEntry } from '../studyQuran'

function Paragraphs({ text }: { text: string }) {
  return <>{text.split(/\n\n+/).map((p, i) => <p key={i}>{p}</p>)}</>
}
function Note({ entry }: { entry: StudyEntry }) {
  const range = entry.first_ayah === entry.last_ayah ? String(entry.first_ayah) : `${entry.first_ayah}–${entry.last_ayah}`
  return <section class="study-note" data-entry={entry.id}>
    <h4>{entry.coverage_kind === 'quoted_header' ? 'Source passage' : 'Commentary'} · {entry.surah_id}:{range}</h4>
    <Paragraphs text={entry.text} />
    <p class="muted small">The Study Quran · PDF {entry.pages.length === 1 ? 'page' : 'pages'} {entry.pages.join(', ')}</p>
    {entry.references.length ? <nav class="study-refs" aria-label="Quran cross-references">
      {entry.references.map((r, i) => <a key={i} href={r.target_kind === 'introduction' ? href.verse(r.target_surah) : href.verse(r.target_surah, r.first_ayah!)}>{r.raw.replace(/^,\s*/, '')}</a>)}
    </nav> : null}
  </section>
}

export function StudyQuranPanel({ meta, ayahID }: { meta: Meta; ayahID: number }) {
  const [open, setOpen] = useState(false)
  const { surah } = locate(meta, ayahID)
  const data = useAsync(async () => open ? entriesForAyah(await loadStudyTafsir(meta, surah), ayahID) : null,
    [open, ayahID, meta.version])
  if (!meta.studyQuran) return null
  return <details class="study-panel" lang="en" dir="ltr" onToggle={(e) => setOpen(e.currentTarget.open)}>
    <summary>Tafsir · The Study Quran</summary>
    {open ? data.error ? <p role="alert">Could not load commentary. <button onClick={data.retry}>Retry</button></p>
      : data.loading ? <p role="status">Loading commentary…</p>
        : data.value?.length ? data.value.map((entry) => <Note key={entry.id} entry={entry} />)
          : <p>No separately numbered commentary entry for this ayah in this source.</p> : null}
  </details>
}

export function StudyIntroductionPanel({ meta, surah }: { meta: Meta; surah: number }) {
  const [open, setOpen] = useState(false)
  const data = useAsync(async () => open ? loadStudyIntroduction(meta, surah) : null,[open,surah,meta.version])
  if (!meta.studyQuran) return null
  return <details class="study-panel" lang="en" dir="ltr" onToggle={(e) => setOpen(e.currentTarget.open)}>
    <summary>Surah introduction · The Study Quran</summary>
    {open ? data.error ? <p role="alert">Could not load introduction. <button onClick={data.retry}>Retry</button></p>
      : data.loading ? <p role="status">Loading introduction…</p>
        : data.value ? <><Paragraphs text={data.value.text} /><p class="muted small">PDF pages {data.value.pages.join(', ')}</p></> : null : null}
  </details>
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
        {found.entries.map((entry) => <div key={entry.id}><a href={href.verse(entry.surah_id,entry.first_ayah)}>Open {entry.surah_id}:{entry.first_ayah}</a><Note entry={entry} /></div>)}
      </> : null : null}
  </details>
}
