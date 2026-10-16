import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { loopAyah, player, toggleAyah } from '../audio'
import { type Meta, type TranslationInfo, loadWbw, locate } from '../data'
import { useAsync } from '../hooks'
import { ayahRef, num, t } from '../i18n'
import { href } from '../router'
import { ayahLink, ayahText, copyText, shareText } from '../share'
import { isBookmarked, toggleBookmark } from '../store'
import { sheetOpen } from '../ui'
import { tafsirIndex } from '../tafsir'
import { Icon } from './Icon'
import { StudyChips } from './StudyQuranPanel'

interface Props {
  meta: Meta
  id: number
  ar: string
  translations: { info: TranslationInfo; text: string }[]
  /** 'box': in the side box; 'popup': over the page, under the ayah. */
  variant: 'box' | 'popup'
  /** False when translations show elsewhere (inline) or not at all: the panel is then only the actions. */
  showTranslations?: boolean
  /** Opened by a long press: the list of what can be done with the ayah is open at once. */
  menu?: boolean
  /** False when the page already shows each word's meaning. */
  offerWords?: boolean
  style?: JSX.CSSProperties
  panelRef?: preact.Ref<HTMLDivElement>
  onClose: () => void
}

/** Translation and actions for an ayah on a mushaf page. */
export function AyahPanel({ meta, id, ar, translations, variant, showTranslations = true, menu = false, offerWords = true, style, panelRef, onClose }: Props) {
  const { surah, ayah } = locate(meta, id)
  const saved = isBookmarked(id)
  const texts = translations.map((x) => x.text || t('mergedTranslation'))
  const text = () => ayahText(meta, id, ar, texts)
  // While this ayah is the one in the recitation bar, the bar already says which ayah it is and holds play, pause
  // and repeat: the panel does not repeat them. The phone's sheet hides the bar, so there it has them itself.
  const p = player.value
  const inPlayer = p?.ayahId === id && !sheetOpen.value
  const playingHere = p?.ayahId === id && (p.status === 'playing' || p.status === 'loading')
  // on the phone, with the translation already on the page, starting the recitation hands over to the bar
  const handOver = () => { if (!showTranslations && sheetOpen.peek()) onClose() }
  const [more, setMore] = useState(menu)
  // asked for from the list: the whole translation (when the page shows it split over its lines) and each word's meaning
  const [fullTr, setFullTr] = useState(false)
  const [words, setWords] = useState(false)
  useEffect(() => {
    setMore(menu)
    setFullTr(false)
    setWords(false)
  }, [id, menu])
  const wbw = useAsync(async () => (words ? (await loadWbw(surah))[ayah - 1] ?? [] : null), [words, surah, ayah])
  const showTr = showTranslations || fullTr
  return (
    <div ref={panelRef} class={`ayah-panel ayah-${variant}`} style={style} role="region" aria-label={ayahRef(meta.surahs[surah - 1]!, ayah)} data-testid="ayah-panel">
      <div class="sheet-head ayah-head">
        <strong class={inPlayer ? 'visually-hidden' : 'ayah-ref'}>{num(surah)}:{num(ayah)}</strong>
        <div class="ayah-actions">
          {inPlayer ? null : (
            <button class="icon-btn" onClick={() => { toggleAyah(id); if (!playingHere) handOver() }} aria-label={playingHere ? t('pause') : t('playFromHere')}>
              <Icon name={playingHere ? 'pause' : 'play'} size={20} />
            </button>
          )}
          <button class="icon-btn" onClick={() => toggleBookmark(id)} aria-label={saved ? t('unbookmark') : t('bookmark')} aria-pressed={saved}>
            <Icon name={saved ? 'bookmarkFilled' : 'bookmark'} size={20} />
          </button>
          <button class="icon-btn" onClick={() => setMore(!more)} aria-label={t('more')} aria-expanded={more}>
            <Icon name="more" size={20} />
          </button>
        </div>
        <button class="icon-btn ayah-close" onClick={onClose} aria-label={t('close')}>
          <Icon name="close" size={18} />
        </button>
      </div>
      {more ? (
        <div class="ayah-more">
          {showTranslations ? null : (
            <button onClick={() => { setFullTr(!fullTr); setMore(false) }} aria-pressed={fullTr}>
              <Icon name="book" size={18} /> {t('ayahTranslation')}
            </button>
          )}
          {meta.wbw && offerWords ? (
            <button onClick={() => { setWords(!words); setMore(false) }} aria-pressed={words}>
              <Icon name="list" size={18} /> {t('wordByWord')}
            </button>
          ) : null}
          {inPlayer ? null : (
            <button onClick={() => { loopAyah(id, true); setMore(false); handOver() }}>
              <Icon name="repeat" size={18} /> {t('repeatAyah')}
            </button>
          )}
          {tafsirIndex.value ? (
            <a href={href.tafsir(surah, ayah)} aria-label={`${t('tafsir')}: ${t('almizan')}`}>
              <Icon name="book" size={18} /> {t('almizan')}
            </a>
          ) : null}
          <a href={href.verse(surah, ayah)}>
            <Icon name="list" size={18} /> {t('openVerseView')}
          </a>
          <button onClick={() => { copyText(text()); setMore(false) }}>
            <Icon name="copy" size={18} /> {t('copy')}
          </button>
          <button onClick={() => { shareText(text(), ayahLink(meta, id)); setMore(false) }}>
            <Icon name="share" size={18} /> {t('share')}
          </button>
        </div>
      ) : null}
      <div class="sheet-body">
        {words && wbw.value ? (
          <p class="panel-wbw" lang="ar" dir="rtl">
            {wbw.value.map(([w, fa], k) => (
              <span class="pw" key={k}><span class="pw-ar">{w}</span><span class="pw-fa" lang="fa">{fa}</span></span>
            ))}
          </p>
        ) : null}
        {showTr && translations.length === 0 ? <p class="muted small">{t('translationsHint')}</p> : null}
        {showTr ? translations.map((x, i) => (
          <div class="tr-block" key={x.info.id}>
            {translations.length > 1 ? <p class="tr-label">{x.info.name}</p> : null}
            <p class={`tr${x.text ? '' : ' merged'}`} lang={x.info.lang} dir={x.info.dir}>
              {texts[i]}
            </p>
          </div>
        )) : null}
        {meta.studyQuran ? <StudyChips meta={meta} ayahID={id} all /> : null}
      </div>
    </div>
  )
}
