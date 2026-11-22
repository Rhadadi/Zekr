import { chooseAyahWords } from '../wordSelection'
import { useState } from 'preact/hooks'
import { loopAyah, looping, toggleAyah } from '../audio'
import { type Meta, type TranslationInfo } from '../data'
import { lang, num, t } from '../i18n'
import { href } from '../router'
import { ayahLink, ayahText, copyText, shareImage, shareText } from '../share'
import { isBookmarked, quranText, toggleBookmark } from '../store'
import { tafsirIndex } from '../tafsir'
import { classicsIndex } from '../classics'
import { Icon } from './Icon'
import { TafsirTab } from './TafsirTab'
import { StudyChips } from './StudyQuranPanel'
import { readStudySources, saveStudySources, studySourceName, StudyAddedContent, StudyAddedTranslation, StudySourcePicker } from './StudySources'
export function StudyVerse({ meta, surah, n, ar, translations, active, playing, paused, focused, onSelect, onPlay }: {
  meta: Meta; surah: number; n: number; ar: string;
  translations: { info: TranslationInfo; text: string }[];
  active: boolean; playing: boolean; paused: boolean; focused: boolean; onSelect: () => void; onPlay: () => void;
}) {
  const id = meta.surahs[surah - 1]!.first + n - 1
  const [more, setMore] = useState(false)
  const [picker, setPicker] = useState(false)
  const [sources, setSources] = useState(() => readStudySources(id))
  const saved = isBookmarked(id)
  const sounding = playing && !paused
  const defaults = translations.map(x => x.info.id)
  const extraTranslations = sources.filter(x => x.startsWith('tr:') && !defaults.includes(x.slice(3))).map(x => meta.translations.find(y => y.id === x.slice(3))).filter((x): x is TranslationInfo => !!x)
  const extraNotes = sources.filter(x => x === 'study_quran' ? !!meta.studyQuran : x === 'almizan' ? meta.tafsir?.includes('almizan') : x === 'words' ? !!meta.wbw : x.startsWith('classic:') && meta.classics?.includes(x.slice(8)))
  const changeSource = (source: string, checked: boolean) => setSources(previous => {
    const next = checked ? [...new Set([...previous, source])] : previous.filter(x => x !== source)
    saveStudySources(id, next)
    return next
  })
  const removeSource = (source: string) => {
    onSelect(); changeSource(source, false)
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`#a-${n} .study-add-source`)?.focus({ preventScroll: true }))
  }
  const remove = (source: string) => <button class="study-remove-source" aria-label={t('studyRemoveSource', { name: studySourceName(meta, source) })} onClick={e => { e.stopPropagation(); removeSource(source) }}><Icon name="close" size={14} /></button>
  const text = () => ayahText(meta, id, ar, translations.map(x => x.text))
  // the tafsir: one tap under the ayah (Al-Mizan first, the classical books and the Study Quran in the same list)
  const [tafsirOpen, setTafsirOpen] = useState(false)
  const hasTafsir = !!(meta.studyQuran || tafsirIndex.value || classicsIndex.value)
  return <article class={`ayah study-ayah${playing ? ' playing' : ''}${focused ? ' focused' : ''}`} aria-label={t('ayahN', { n })} id={`a-${n}`} data-ayah={n} data-id={id} onClick={onSelect}>
    <p class="ar study-ar" lang="ar" dir="rtl">{quranText(ar)}<button class="study-marker" lang={lang.value} aria-label={t('more')} title={t('more')} aria-expanded={more} onClick={() => setMore(!more)}>{num(n)}</button></p>
    {more ? <div class="study-more">
      <button aria-label={sounding ? t('pause') : t('play')} aria-pressed={sounding} onClick={e => { e.stopPropagation(); onSelect(); if (!sounding) onPlay(); toggleAyah(id) }}><Icon name={sounding ? 'pause' : 'play'} size={17} />{sounding ? t('pause') : t('playThisAyah')}</button>
      <button onClick={() => toggleBookmark(id)} aria-pressed={saved}>{saved ? t('unbookmark') : t('bookmark')}</button>
      <button onClick={() => loopAyah(id, !looping.value)} aria-pressed={playing && looping.value}>{t('repeatAyah')}</button>
      <button onClick={() => chooseAyahWords(id)}>{t('words')}</button>
      <button onClick={() => copyText(text())}>{t('copy')}</button>
      <button onClick={() => shareText(text(), ayahLink(meta, id))}>{t('share')}</button>
      <button onClick={() => shareImage(meta, id, ar, translations[0]?.text || undefined, translations[0]?.info.dir ?? 'rtl', ayahLink(meta, id))}>{t('shareImage')}</button>
      {tafsirIndex.value ? <a href={href.tafsir(surah, n)}>{t('tafsir')}: {t('almizan')}</a> : null}
      {meta.studyQuran ? <StudyChips meta={meta} ayahID={id} /> : null}
    </div> : null}
    <div class="study-companion" id={`companion-${n}`} role={active ? 'region' : undefined} aria-label={active ? t('studyCompanion', { ayah: num(`${surah}:${n}`) }) : undefined}>
      <div class="study-translations" data-count={translations.length + extraTranslations.length}>
        {translations.length ? translations.map(x => <div class="study-translation" key={x.info.id} data-language={x.info.lang} role="group" aria-label={x.info.name} title={x.info.name}>
          {translations.filter(y => y.info.lang === x.info.lang).length + extraTranslations.filter(y => y.lang === x.info.lang).length > 1 ? <p class="tr-label" lang={x.info.lang} dir={x.info.dir}>{x.info.name}</p> : null}
          <p data-word-source={x.info.id} class={`tr${x.text ? '' : ' merged'}`} lang={x.info.lang} dir={x.info.dir}>{x.text || t('mergedTranslation')}</p>
        </div>) : !extraTranslations.length ? <p class="study-empty">{t('studyNoTranslations')}</p> : null}
        {extraTranslations.map(info => <div class="study-translation study-added-translation" data-language={info.lang} data-source={`tr:${info.id}`} role="group" aria-label={info.name} key={info.id}>
          <div class="study-source-heading"><span>{info.name}</span>{remove(`tr:${info.id}`)}</div>
          <StudyAddedTranslation info={info} id={id} />
        </div>)}
      </div>
    <div class="study-ayah-tools">
      {hasTafsir ? <button class="study-tafsir-toggle" aria-expanded={tafsirOpen} aria-controls={`tafsir-${n}`} onClick={e => { e.stopPropagation(); onSelect(); setTafsirOpen(!tafsirOpen) }}><Icon name="book" size={15} />{t('tabTafsir')}</button> : null}
      <button class="study-add-source" aria-haspopup="dialog" aria-expanded={picker} onClick={e => { e.stopPropagation(); onSelect(); setPicker(true) }}><span aria-hidden="true">+</span>{t('studyAddSources')}</button>
      {active ? <button class="study-listen" aria-label={sounding ? t('pause') : t('playFromHere')} onClick={e => {
        e.stopPropagation(); onSelect(); if (!sounding) onPlay(); toggleAyah(id)
        if (!sounding && e.detail === 0) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.player-controls .big')?.focus({ preventScroll: true }))
      }}><Icon name={sounding ? 'pause' : 'play'} size={15} /></button> : null}
    </div>
      {tafsirOpen ? <div class="study-tafsir" id={`tafsir-${n}`}><TafsirTab meta={meta} id={id} surah={surah} ayah={n} /></div> : null}
      {extraNotes.map(source => <StudyAddedNote meta={meta} surah={surah} ayah={n} id={id} source={source} onRemove={() => removeSource(source)} key={source} />)}
    </div>
    {picker ? <StudySourcePicker meta={meta} surah={surah} ayah={n} defaults={defaults} selected={sources} onChange={changeSource} onClose={() => setPicker(false)} /> : null}
  </article>
}

function StudyAddedNote({ meta, surah, ayah, id, source, onRemove }: { meta: Meta; surah: number; ayah: number; id: number; source: string; onRemove: () => void }) {
  const [open, setOpen] = useState(true)
  const name = studySourceName(meta, source)
  const target = `study-note-${id}-${source}`
  return <section class="study-added-source" data-source={source} aria-label={name}>
    <div class="study-source-heading"><button class="study-source-toggle" aria-expanded={open} aria-controls={target} onClick={() => setOpen(!open)}><Icon name="chevron" size={14} /><span>{name}</span></button><button class="study-remove-source" aria-label={t('studyRemoveSource', { name })} onClick={e => { e.stopPropagation(); onRemove() }}><Icon name="close" size={14} /></button></div>
    <div class="study-companion-body" id={target} hidden={!open}><StudyAddedContent meta={meta} surah={surah} ayah={ayah} id={id} source={source} /></div>
  </section>
}
