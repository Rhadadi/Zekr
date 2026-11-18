import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { booksFor, checkClassics, classicsIndex, loadClassic } from '../classics'
import { type Meta, type TranslationInfo, loadTranslation, loadWbw } from '../data'
import { useAsync } from '../hooks'
import { lang, num, t } from '../i18n'
import { fold } from '../search'
import { TafsirView } from '../views/Tafsir'
import { Icon } from './Icon'
import { LoadError, Loading } from './Page'
import { StudyInline } from './StudyQuranPanel'

export function readStudySources(id: number): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`zekr.studySources.${id}`) ?? '[]')
    return Array.isArray(value) ? [...new Set(value.filter((x): x is string => typeof x === 'string' && /^(tr:|classic:|study_quran$|almizan$|words$)/.test(x)))].slice(0, 50) : []
  } catch { return [] }
}

export function saveStudySources(id: number, sources: string[]) {
  try {
    if (sources.length) localStorage.setItem(`zekr.studySources.${id}`, JSON.stringify(sources))
    else localStorage.removeItem(`zekr.studySources.${id}`)
  } catch { /* The open passage still works when device storage is full. */ }
}

export function studySourceName(meta: Meta, source: string): string {
  if (source.startsWith('tr:')) return meta.translations.find(x => x.id === source.slice(3))?.name ?? t('ayahTranslation')
  if (source.startsWith('classic:')) return (classicsIndex.value && classicsIndex.value.books.find(x => x.id === source.slice(8))?.name[lang.value]) || t('classics')
  return source === 'study_quran' ? t('studyQuranName') : source === 'almizan' ? t('almizan') : t('words')
}

/** A small source library for this ayah; the chapter's default translations are left alone. */
export function StudySourcePicker({ meta, surah, ayah, defaults, selected, onChange, onClose }: {
  meta: Meta; surah: number; ayah: number; defaults: string[]; selected: string[];
  onChange: (source: string, checked: boolean) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef(document.activeElement)
  const [category, setCategory] = useState('translation')
  const [query, setQuery] = useState('')
  const index = useAsync(checkClassics, [])
  useLayoutEffect(() => {
    const el = dialog.current
    el?.showModal()
    return () => {
      if (el?.open) el.close()
      if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus({ preventScroll: true })
    }
  }, [])
  const language = (value: string) => value === 'fa' ? 'فارسی' : value === 'ar' ? 'العربية' : 'English'
  const choices = category === 'translation'
    ? meta.translations.map(x => ({ id: `tr:${x.id}`, name: x.name, detail: x.translator, language: x.lang, fixed: defaults.includes(x.id) }))
    : category === 'words'
      ? meta.wbw ? [{ id: 'words', name: t('words'), detail: '', language: 'fa', fixed: false }] : []
      : [
        ...(meta.studyQuran ? [{ id: 'study_quran', name: t('studyQuranName'), detail: '', language: 'en', fixed: false }] : []),
        ...(meta.tafsir?.includes('almizan') ? [{ id: 'almizan', name: t('almizan'), detail: '', language: 'fa', fixed: false }] : []),
        ...(index.value ? booksFor(index.value, surah).map(x => ({ id: `classic:${x.id}`, name: x.name[lang.value], detail: x.author[lang.value], language: x.lang, fixed: false })) : []),
      ]
  const found = choices.filter(x => fold(`${x.name} ${x.detail} ${language(x.language)}`).includes(fold(query)))
  return <dialog ref={dialog} class="study-source-picker" aria-labelledby="study-source-title"
    onClose={() => { if (dialog.current) onClose() }} onCancel={e => { e.preventDefault(); onClose() }}
    onKeyDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose() }}>
    <div class="study-picker-head"><div><h2 id="study-source-title">{t('studyAddSources')}</h2><small>{num(`${surah}:${ayah}`)}</small></div><button class="icon-btn" aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button></div>
    <div class="study-source-search"><Icon name="search" size={17} /><input type="search" autoFocus dir="auto" aria-label={t('studySearchSources')} placeholder={t('studySearchSources')} value={query} onInput={e => setQuery(e.currentTarget.value)} /></div>
    <div class="study-source-filters" role="group" aria-label={t('sources')}>
      {[['translation', t('ayahTranslation')], ['tafsir', t('tafsir')], ['words', t('words')]].map(([value, label]) => <button key={value} aria-pressed={category === value} onClick={() => { setCategory(value!); setQuery('') }}>{label}</button>)}
    </div>
    <div class="study-source-list">
      {category === 'tafsir' && index.loading && meta.classics?.length ? <Loading /> : null}
      {category === 'tafsir' && index.error ? <LoadError retry={index.retry} /> : null}
      {found.map(x => <label class="study-source-choice" key={x.id} title={x.detail}><input type="checkbox" aria-label={x.name} checked={x.fixed || selected.includes(x.id)} disabled={x.fixed} onChange={e => onChange(x.id, e.currentTarget.checked)} /><span>{x.name}</span><small lang={x.language}>{language(x.language)}</small></label>)}
      {!found.length && !index.loading ? <p class="study-empty">{t('studySourcesEmpty')}</p> : null}
    </div>
    <button class="study-picker-done" onClick={onClose}>{t('studySourcesDone')}</button>
  </dialog>
}

export function StudyAddedTranslation({ info, id }: { info: TranslationInfo; id: number }) {
  const data = useAsync(async () => (await loadTranslation(info.id))[id - 1], [info.id, id])
  return data.error ? <LoadError retry={data.retry} /> : data.loading ? <Loading /> : <p class={`tr${data.value ? '' : ' merged'}`} lang={info.lang} dir={info.dir}>{data.value || t('mergedTranslation')}</p>
}

export function StudyAddedContent({ meta, surah, ayah, id, source }: { meta: Meta; surah: number; ayah: number; id: number; source: string }) {
  if (source === 'study_quran') return <StudyInline meta={meta} ayahID={id} />
  if (source === 'almizan') return <TafsirView meta={meta} surah={surah} ayah={ayah} idPrefix={`study-${id}-almizan`} />
  return source === 'words' ? <StudyWords surah={surah} ayah={ayah} /> : <StudyClassic source={source.slice(8)} surah={surah} ayah={ayah} />
}

function StudyWords({ surah, ayah }: { surah: number; ayah: number }) {
  const data = useAsync(async () => (await loadWbw(surah))[ayah - 1] ?? [], [surah, ayah])
  return data.error ? <LoadError retry={data.retry} /> : !data.value ? <Loading /> : <div class="study-wbw" dir="rtl">{data.value.map(([word, meaning], i) => <span class="study-word" key={i}><span class="study-word-ar" lang="ar">{word}</span><span class="study-word-meaning" lang="fa">{meaning}</span></span>)}</div>
}

function StudyClassic({ source, surah, ayah }: { source: string; surah: number; ayah: number }) {
  const data = useAsync(async () => {
    const index = await checkClassics()
    if (!index) return null
    const book = index.books.find(x => x.id === source)
    return book ? { book, source: book.source ?? index.source, text: await loadClassic(book, surah, ayah) } : null
  }, [source, surah, ayah])
  const d = data.value
  return data.error ? <LoadError retry={data.retry} /> : data.loading ? <Loading /> : !d ? <p>{t('classicsMissing')}</p> : <div lang={d.book.lang} dir={d.book.lang === 'en' ? 'ltr' : 'rtl'}>
    <p class="small muted">{d.book.author[lang.value]}</p>
    {d.text ? d.text.split('\n').filter(x => x.trim()).map((text, i) => text.startsWith('# ') ? <h3 class="classic-part" key={i}>{text.slice(2)}</h3> : <p key={i}>{text}</p>) : <p>{t('classicsNone')}</p>}
    <p class="small muted" dir="ltr">{t('classicsSource', { source: d.source })}</p>
  </div>
}
