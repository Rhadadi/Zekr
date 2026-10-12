import { toggleAyah } from '../audio'
import { type Meta } from '../data'
import { dailyAyah } from '../daily'
import { useAsync, useNow } from '../hooks'
import { ayahRef, formatDuration, t } from '../i18n'
import { currentSlot } from '../rotation'
import { href } from '../router'
import { ayahLink, ayahText, copyText } from '../share'
import { settings } from '../store'
import { Icon } from './Icon'

export function DailyCard({ meta }: { meta: Meta }) {
  const now = useNow(20_000)
  const s = settings.value
  const slot = currentSlot(now, s.daily.period)
  const { value: d, error, retry } = useAsync(() => dailyAyah(meta, s, now), [slot, JSON.stringify(s.daily), s.script])
  const label = s.daily.period === 3600 ? t('ayahOfTheHour') : t('ayahOfTheDay')
  if (!d) {
    return (
      <section class="card daily" aria-busy={!error}>
        <div class="card-head"><span class="eyebrow">{label}</span></div>
        {error ? <button class="btn" onClick={retry}>{t('retry')}</button> : <p class="skeleton" role="status">{t('loading')}</p>}
      </section>
    )
  }
  const surah = meta.surahs[d.surah - 1]!
  const copy = () => copyText(ayahText(meta, d.id, d.ar, [d.fa ?? '', d.en ?? ''].filter(Boolean)))
  return (
    <section class="card daily" data-testid="daily-card" data-ayah-id={d.id}>
      <div class="card-head">
        <span class="eyebrow">{label}</span>
        <span class="muted small">{t('nextChange', { time: formatDuration(d.endsAt - now) })}</span>
      </div>
      <p class="ar" lang="ar" dir="rtl" style={{ fontSize: `${Math.max(24, s.arabicSize)}px` }}>{d.ar}</p>
      {d.fa !== undefined ? <p class="tr" lang="fa" dir="rtl" style={{ fontSize: `${s.trSize}px` }}>{d.fa || t('mergedTranslation')}</p> : null}
      {d.en !== undefined ? <p class="tr" lang="en" dir="ltr" style={{ fontSize: `${s.trSize}px` }}>{d.en || t('mergedTranslation')}</p> : null}
      <div class="card-foot">
        <a class="ref" href={href.ayah(d.surah, d.ayah)}>{ayahRef(surah, d.ayah)}</a>
        <div class="ayah-actions">
          <button class="icon-btn" onClick={() => toggleAyah(d.id)} aria-label={t('play')}><Icon name="play" size={20} /></button>
          <button class="icon-btn" onClick={copy} aria-label={t('copy')}><Icon name="copy" size={20} /></button>
          <a class="icon-btn" href={ayahLink(meta, d.id)} onClick={(e) => { e.preventDefault(); location.hash = href.ayah(d.surah, d.ayah) }} aria-label={t('openInReader')}>
            <Icon name="chevron" size={20} />
          </a>
        </div>
      </div>
    </section>
  )
}
