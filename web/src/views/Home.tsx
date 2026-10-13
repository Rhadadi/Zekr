import { DailyCard } from '../components/DailyCard'
import { Icon } from '../components/Icon'
import { type Meta } from '../data'
import { ayahRef, t } from '../i18n'
import { href } from '../router'
import { lastRead } from '../store'

/** Two things only: the ayah of the day, and where you left off. Everything else is in the bar below. */
export function Home({ meta }: { meta: Meta }) {
  const last = lastRead.value
  const lastSurah = last ? meta.surahs[last.surah - 1] : undefined
  return (
    <div class="home">
      <h1 class="visually-hidden">{t('appName')}</h1>
      <DailyCard meta={meta} showSettingsLink />
      <a class="continue-row" href={last && lastSurah ? href.ayah(last.surah, last.ayah) : href.surah(1)}>
        <span class="continue-text">
          <span class="muted small">{t('continueReading')}</span>
          <strong>{last && lastSurah ? ayahRef(lastSurah, last.ayah) : t('startReading')}</strong>
        </span>
        <span class="chev-fwd"><Icon name="chevron" size={20} /></span>
      </a>
    </div>
  )
}
