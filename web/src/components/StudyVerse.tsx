import { useState } from 'preact/hooks'
import { loopAyah, looping, toggleAyah } from '../audio'
import { type Meta, type TranslationInfo, loadWbw } from '../data'
import { useAsync } from '../hooks'
import { lang, num, t } from '../i18n'
import { href } from '../router'
import { ayahLink, ayahText, copyText, shareText } from '../share'
import { isBookmarked, toggleBookmark } from '../store'
import { tafsirIndex } from '../tafsir'
import { Icon } from './Icon'
import { StudyChips, StudyInline } from './StudyQuranPanel'
export type StudyTab = 'translation' | 'tafsir' | 'words'
export function StudyVerse({ meta, surah, n, ar, translations, active, tab, playing, paused, focused, onSelect }: {
  meta: Meta; surah: number; n: number; ar: string;
  translations: { info: TranslationInfo; text: string }[];
  active: boolean; tab: StudyTab; playing: boolean; paused: boolean; focused: boolean; onSelect: () => void;
}) {
  const id = meta.surahs[surah - 1]!.first + n - 1
  const [more, setMore] = useState(false)
  const saved = isBookmarked(id)
  const mode = tab
  const sounding = playing && !paused
  const words = useAsync(async () => mode === 'words' && meta.wbw ? (await loadWbw(surah))[n - 1] ?? [] : null, [mode, surah, n])
  const text = () => ayahText(meta, id, ar, translations.map(x => x.text))
  return <article class={`ayah study-ayah${playing ? ' playing' : ''}${focused ? ' focused' : ''}`} aria-label={t('ayahN', { n })} id={`a-${n}`} data-ayah={n} data-id={id} onClick={onSelect}>
    <p class="ar study-ar" lang="ar" dir="rtl">{ar}<button class="study-marker" lang={lang.value} aria-label={t('more')} title={t('more')} aria-expanded={more} onClick={() => setMore(!more)}>{num(n)}</button></p>
    {more ? <div class="study-more">
      <button aria-label={sounding ? t('pause') : t('play')} aria-pressed={sounding} onClick={() => toggleAyah(id)}><Icon name={sounding ? 'pause' : 'play'} size={17} />{sounding ? t('pause') : t('playThisAyah')}</button>
      <button onClick={() => toggleBookmark(id)} aria-pressed={saved}>{saved ? t('unbookmark') : t('bookmark')}</button>
      <button onClick={() => loopAyah(id, !looping.value)} aria-pressed={playing && looping.value}>{t('repeatAyah')}</button>
      <button onClick={() => copyText(text())}>{t('copy')}</button>
      <button onClick={() => shareText(text(), ayahLink(meta, id))}>{t('share')}</button>
      {tafsirIndex.value ? <a href={href.tafsir(surah, n)}>{t('tafsir')}: {t('almizan')}</a> : null}
      {meta.studyQuran ? <StudyChips meta={meta} ayahID={id} /> : null}
    </div> : null}
    <div class="study-companion" id={`companion-${n}`} role={active ? 'tabpanel' : undefined} aria-labelledby={active ? `study-tab-${mode}` : undefined} tabIndex={active ? 0 : undefined}>
      {mode === 'translation' ? <div class="study-translations" data-count={translations.length}>
        {translations.length ? translations.map(x => <div class="study-translation" key={x.info.id} data-language={x.info.lang} role="group" aria-label={x.info.name} title={x.info.name}>
          {translations.filter(y => y.info.lang === x.info.lang).length > 1 ? <p class="tr-label" lang={x.info.lang} dir={x.info.dir}>{x.info.name}</p> : null}
          <p class={`tr${x.text ? '' : ' merged'}`} lang={x.info.lang} dir={x.info.dir}>{x.text || t('mergedTranslation')}</p>
        </div>) : <p class="study-empty">{t('studyNoTranslations')}</p>}
      </div> : mode === 'tafsir' ? <div class="study-companion-body">
        {meta.studyQuran ? <StudyInline meta={meta} ayahID={id} /> : <p>{t('tafsirMissing')}</p>}
        {tafsirIndex.value ? <a class="study-source-link" href={href.tafsir(surah, n)}>{t('almizan')}</a> : null}
      </div> : <div class="study-companion-body">
        {!meta.wbw ? <p>{t('studyWordsMissing')}</p> : words.error ? <button class="btn" onClick={words.retry}>{t('retry')}</button> : !words.value ? <p class="status">{t('loading')}</p> : <div class="study-wbw" dir="rtl">{words.value.map(([word, meaning], i) => <span class="study-word" key={i}><span class="study-word-ar" lang="ar">{word}</span><span class="study-word-meaning" lang="fa">{meaning}</span></span>)}</div>}
      </div>}
    </div>
  </article>
}
