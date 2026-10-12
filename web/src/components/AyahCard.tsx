import { memo } from 'preact/compat'
import { toggleAyah } from '../audio'
import { type Meta, type TranslationInfo, locate } from '../data'
import { ayahRef, num, t } from '../i18n'
import { href } from '../router'
import { highlight } from '../search'
import { copyText, ayahLink, ayahText, shareText } from '../share'
import { isBookmarked, settings, toggleBookmark } from '../store'
import { Icon } from './Icon'

export interface TranslationText {
  info: TranslationInfo
  text: string
}

interface Props {
  meta: Meta
  id: number
  ar: string
  translations: TranslationText[]
  playing?: boolean
  /** Reader: highlight briefly after jumping to this ayah. */
  focused?: boolean
  /** Search and saved lists: show the surah reference (a link) instead of just the number. */
  showRef?: boolean
  /** Highlight matches of this query. */
  query?: string
}

function Marked({ text, query }: { text: string; query?: string }) {
  if (!query) return <>{text}</>
  return (
    <>
      {highlight(text, query).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </>
  )
}

function AyahCardView({ meta, id, ar, translations, playing, focused, showRef, query }: Props) {
  const { surah, ayah } = locate(meta, id)
  const s = settings.value
  const saved = isBookmarked(id)
  const labelled = translations.length > 1
  const trTexts = translations.map((x) => x.text || t('mergedTranslation'))
  const text = () => ayahText(meta, id, ar, trTexts)
  return (
    <article class={`ayah${playing ? ' playing' : ''}${focused ? ' focused' : ''}`} id={`a-${ayah}`} data-ayah={ayah} data-id={id}>
      <div class="ayah-bar">
        {showRef ? (
          <a class="ref" href={href.ayah(surah, ayah)}>
            {ayahRef(meta.surahs[surah - 1]!, ayah)}
          </a>
        ) : (
          <span class="num" aria-label={t('ayahN', { n: ayah })}>{num(ayah)}</span>
        )}
        <div class="ayah-actions">
          <button class="icon-btn" onClick={() => toggleAyah(id)} aria-label={playing ? t('pause') : t('play')} aria-pressed={playing ?? false}>
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
        </div>
      </div>
      <p class="ar" lang="ar" dir="rtl" style={{ fontSize: `${s.arabicSize}px` }}>
        <Marked text={ar} query={query} />
      </p>
      {translations.map((x, i) => (
        <div class="tr-block" key={x.info.id}>
          {labelled ? <p class="tr-label">{x.info.name}</p> : null}
          <p class={`tr${x.text ? '' : ' merged'}`} lang={x.info.lang} dir={x.info.dir} style={{ fontSize: `${s.trSize}px` }}>
            {x.text ? <Marked text={x.text} query={query} /> : trTexts[i]}
          </p>
        </div>
      ))}
    </article>
  )
}

export const AyahCard = memo(AyahCardView)
