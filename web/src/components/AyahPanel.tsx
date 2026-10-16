import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { loopAyah, player, toggleAyah } from '../audio'
import { type Meta, type TranslationInfo, locate } from '../data'
import { ayahRef, num, t } from '../i18n'
import { href } from '../router'
import { ayahLink, ayahText, copyText, shareText } from '../share'
import { isBookmarked, toggleBookmark } from '../store'
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
  style?: JSX.CSSProperties
  panelRef?: preact.Ref<HTMLDivElement>
  onClose: () => void
}

/** Translation and actions for an ayah on a mushaf page. */
export function AyahPanel({ meta, id, ar, translations, variant, showTranslations = true, style, panelRef, onClose }: Props) {
  const { surah, ayah } = locate(meta, id)
  const saved = isBookmarked(id)
  const texts = translations.map((x) => x.text || t('mergedTranslation'))
  const text = () => ayahText(meta, id, ar, texts)
  // While this ayah is the one in the recitation bar, the bar already says which ayah it is and holds play, pause
  // and repeat: the panel does not repeat them.
  const inPlayer = player.value?.ayahId === id
  const [more, setMore] = useState(false)
  return (
    <div ref={panelRef} class={`ayah-panel ayah-${variant}`} style={style} role="region" aria-label={ayahRef(meta.surahs[surah - 1]!, ayah)} data-testid="ayah-panel">
      <div class="sheet-head ayah-head">
        <strong class={inPlayer ? 'visually-hidden' : 'ayah-ref'}>{num(surah)}:{num(ayah)}</strong>
        <div class="ayah-actions">
          {inPlayer ? null : (
            <button class="icon-btn" onClick={() => toggleAyah(id)} aria-label={t('playFromHere')}>
              <Icon name="play" size={20} />
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
          {inPlayer ? null : (
            <button onClick={() => { loopAyah(id, true); setMore(false) }}>
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
        {showTranslations && translations.length === 0 ? <p class="muted small">{t('translationsHint')}</p> : null}
        {showTranslations ? translations.map((x, i) => (
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
