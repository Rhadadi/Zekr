import type { JSX } from 'preact'
import { loopAyah, looping, toggleAyah } from '../audio'
import { type Meta, type TranslationInfo, locate } from '../data'
import { ayahRef, t } from '../i18n'
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
  playing: boolean
  /** 'box': in the side box; 'popup': over the page, under the ayah. */
  variant: 'box' | 'popup'
  /** False when translations show elsewhere (inline) or not at all: the panel is then only the actions. */
  showTranslations?: boolean
  style?: JSX.CSSProperties
  panelRef?: preact.Ref<HTMLDivElement>
  onClose: () => void
}

/** Translation and actions for an ayah on a mushaf page. */
export function AyahPanel({ meta, id, ar, translations, playing, variant, showTranslations = true, style, panelRef, onClose }: Props) {
  const { surah, ayah } = locate(meta, id)
  const saved = isBookmarked(id)
  const texts = translations.map((x) => x.text || t('mergedTranslation'))
  const text = () => ayahText(meta, id, ar, texts)
  const repeating = looping.value && playing
  return (
    <div ref={panelRef} class={`ayah-panel ayah-${variant}`} style={style} role="region" aria-label={ayahRef(meta.surahs[surah - 1]!, ayah)} data-testid="ayah-panel">
      <div class="sheet-head">
        <strong>{ayahRef(meta.surahs[surah - 1]!, ayah)}</strong>
      </div>
      <div class="ayah-main">
        <button class="btn primary" onClick={() => toggleAyah(id)}>
          <Icon name={playing ? 'pause' : 'play'} size={18} /> {playing ? t('pause') : t('playFromHere')}
        </button>
        <button class="btn" onClick={() => loopAyah(id, !repeating)} aria-pressed={repeating}>
          <Icon name="repeat" size={18} /> {t('repeatAyah')}
        </button>
        {tafsirIndex.value ? (
          <a class="btn" href={href.tafsir(surah, ayah)} aria-label={`${t('tafsir')}: ${t('almizan')}`}>
            <Icon name="book" size={18} /> {t('almizan')}
          </a>
        ) : null}
      </div>
      <div class="ayah-actions">
        <button class="icon-btn" onClick={() => toggleBookmark(id)} aria-label={saved ? t('unbookmark') : t('bookmark')} aria-pressed={saved}>
          <Icon name={saved ? 'bookmarkFilled' : 'bookmark'} size={20} />
        </button>
        <button class="icon-btn" onClick={() => copyText(text())} aria-label={t('copy')}>
          <Icon name="copy" size={20} />
        </button>
        <button class="icon-btn" onClick={() => shareText(text(), ayahLink(meta, id))} aria-label={t('share')}>
          <Icon name="share" size={20} />
        </button>
        <a class="icon-btn" href={href.verse(surah, ayah)} aria-label={t('openVerseView')}>
          <Icon name="list" size={20} />
        </a>
        <button class="icon-btn" onClick={onClose} aria-label={t('close')}>
          <Icon name="close" size={20} />
        </button>
      </div>
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
