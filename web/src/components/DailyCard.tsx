import { player, toggleAyah } from '../audio'
import { type Meta } from '../data'
import { dailyAyah } from '../daily'
import { useAsync, useNow } from '../hooks'
import { ayahRef, t } from '../i18n'
import { currentSlot } from '../rotation'
import { href } from '../router'
import { ayahLink, ayahText, copyText, shareText } from '../share'
import { settings } from '../store'
import { Icon } from './Icon'

/** The ayah of the day (or hour): the Arabic, its translation, where it is from, and a few actions. */
export function DailyCard({ meta, showSettingsLink = false }: { meta: Meta; showSettingsLink?: boolean }) {
  const now = useNow(20_000)
  const s = settings.value
  const slot = currentSlot(now, s.daily.period)
  const { value: d, error, retry } = useAsync(() => dailyAyah(meta, s, now), [slot, JSON.stringify(s.daily), s.script])
  const label = s.daily.period === 3600 ? t('ayahOfTheHour') : t('ayahOfTheDay')
  if (!d) {
    return (
      <section class="feature" aria-busy={!error}>
        <p class="feature-label">{label}</p>
        {error ? <button class="btn" onClick={retry}>{t('retry')}</button> : <p class="skeleton" role="status">{t('loading')}</p>}
      </section>
    )
  }
  const surah = meta.surahs[d.surah - 1]!
  const translations = [d.fa, d.en].filter((x): x is string => x !== undefined)
  const text = () => ayahText(meta, d.id, d.ar, translations.map((x) => x || t('mergedTranslation')))
  const p = player.value
  const playing = !p?.commentary && p?.ayahId === d.id && (p.status === 'playing' || p.status === 'loading')
  return (
    <section class="feature" data-testid="daily-card" data-ayah-id={d.id}>
      <div class="feature-head">
        <p class="feature-label">{label}</p>
        {showSettingsLink ? (
          <a class="icon-btn small" href={href.daily} aria-label={t('dailySettings')}>
            <Icon name="sliders" size={18} />
          </a>
        ) : null}
      </div>
      <p class="ar feature-ar" lang="ar" dir="rtl" style={{ fontSize: `${Math.max(26, s.arabicSize)}px` }}>{d.ar}</p>
      {d.fa !== undefined ? <p class="feature-tr" lang="fa" dir="rtl" style={{ fontSize: `${s.trSize}px` }}>{d.fa || t('mergedTranslation')}</p> : null}
      {d.en !== undefined ? <p class="feature-tr" lang="en" dir="ltr" style={{ fontSize: `${s.trSize}px` }}>{d.en || t('mergedTranslation')}</p> : null}
      <div class="feature-foot">
        <a class="ref" href={href.ayah(d.surah, d.ayah)}>{ayahRef(surah, d.ayah)}</a>
        <div class="ayah-actions">
          <button class="icon-btn" onClick={() => toggleAyah(d.id, 'ayah')} aria-label={playing ? t('pause') : t('playThisAyah')} aria-pressed={playing}>
            <Icon name={playing ? 'pause' : 'play'} size={20} />
          </button>
          <button class="icon-btn" onClick={() => copyText(text())} aria-label={t('copy')}><Icon name="copy" size={20} /></button>
          <button class="icon-btn" onClick={() => shareText(text(), ayahLink(meta, d.id))} aria-label={t('share')}><Icon name="share" size={20} /></button>
        </div>
      </div>
    </section>
  )
}
