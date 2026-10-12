import { DailyCard } from '../components/DailyCard'
import { PageHeader } from '../components/Page'
import { type Meta } from '../data'
import { ayahRef, lang, num, t } from '../i18n'
import { href } from '../router'
import { lastRead } from '../store'

export function Home({ meta }: { meta: Meta }) {
  const last = lastRead.value
  const lastSurah = last ? meta.surahs[last.surah - 1] : undefined
  return (
    <>
      <PageHeader title={t('appName')} sub={lang.value === 'fa' ? 'Zekr' : 'ذکر'} />
      <DailyCard meta={meta} />
      <p class="link-row"><a href={href.daily}>{t('dailyTitle')} · {t('settings')}</a></p>
      <a class="card continue" href={last && lastSurah ? href.ayah(last.surah, last.ayah) : href.surah(1)}>
        <span class="eyebrow">{t('continueReading')}</span>
        <strong>{last && lastSurah ? ayahRef(lastSurah, last.ayah) : t('startReading')}</strong>
      </a>
      <div class="tiles">
        <a class="tile" href={href.index}>{t('surahs')}<span class="muted small">{num(114)}</span></a>
        <a class="tile" href={href.juz}>{t('juz')}<span class="muted small">{num(30)}</span></a>
        <a class="tile" href={href.search()}>{t('navSearch')}</a>
        <a class="tile" href={href.saved}>{t('navBookmarks')}</a>
      </div>
      <p class="muted small tip">{t('install')}</p>
    </>
  )
}
