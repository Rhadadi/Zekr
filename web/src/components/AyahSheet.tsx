import { useRef } from 'preact/hooks'
import { toggleAyah } from '../audio'
import { type Meta, type TranslationInfo, locate } from '../data'
import { ayahRef, t } from '../i18n'
import { href } from '../router'
import { ayahLink, ayahText, copyText, shareText } from '../share'
import { isBookmarked, toggleBookmark } from '../store'
import { tafsirIndex } from '../tafsir'
import { Icon } from './Icon'
import { useSheetSpace } from './sheetSpace'

interface Props {
  meta: Meta
  id: number
  ar: string
  translations: { info: TranslationInfo; text: string }[]
  playing: boolean
  onClose: () => void
}

/** Translation and actions for the ayah selected on a mushaf page. */
export function AyahSheet({ meta, id, ar, translations, playing, onClose }: Props) {
  const { surah, ayah } = locate(meta, id)
  const saved = isBookmarked(id)
  const texts = translations.map((x) => x.text || t('mergedTranslation'))
  const text = () => ayahText(meta, id, ar, texts)
  const ref = useRef<HTMLDivElement>(null)
  useSheetSpace(ref)
  return (
    <div ref={ref} class="ayah-sheet" role="region" aria-label={ayahRef(meta.surahs[surah - 1]!, ayah)} data-testid="ayah-sheet">
      <div class="sheet-head">
        <strong>{ayahRef(meta.surahs[surah - 1]!, ayah)}</strong>
        <div class="ayah-actions">
          <button class="icon-btn" onClick={() => toggleAyah(id)} aria-label={playing ? t('pause') : t('play')}>
            <Icon name={playing ? 'pause' : 'play'} size={20} />
          </button>
          <button class="icon-btn" onClick={() => toggleBookmark(id)} aria-label={saved ? t('unbookmark') : t('bookmark')} aria-pressed={saved}>
            <Icon name={saved ? 'bookmarkFilled' : 'bookmark'} size={20} />
          </button>
          <button class="icon-btn" onClick={() => copyText(text())} aria-label={t('copy')}>
            <Icon name="copy" size={20} />
          </button>
          <button class="icon-btn" onClick={() => shareText(text(), ayahLink(meta, id))} aria-label={t('share')}>
            <Icon name="share" size={20} />
          </button>
          {tafsirIndex.value ? (
            <a class="icon-btn" href={href.tafsir(surah, ayah)} aria-label={`${t('tafsir')}: ${t('almizan')}`}>
              <Icon name="book" size={20} />
            </a>
          ) : null}
          <a class="icon-btn" href={href.verse(surah, ayah)} aria-label={t('openVerseView')}>
            <Icon name="list" size={20} />
          </a>
          <button class="icon-btn" onClick={onClose} aria-label={t('close')}>
            <Icon name="close" size={20} />
          </button>
        </div>
      </div>
      <div class="sheet-body">
        {translations.length === 0 ? <p class="muted small">{t('translationsHint')}</p> : null}
        {translations.map((x, i) => (
          <div class="tr-block" key={x.info.id}>
            {translations.length > 1 ? <p class="tr-label">{x.info.name}</p> : null}
            <p class={`tr${x.text ? '' : ' merged'}`} lang={x.info.lang} dir={x.info.dir}>
              {texts[i]}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
