import { DailyCard } from '../components/DailyCard'
import { Icon } from '../components/Icon'
import { type Meta } from '../data'
import { type DailyAyah, dailyAyah, poolName } from '../daily'
import { useAsync, useNow } from '../hooks'
import { ayahRef, lang, t } from '../i18n'
import { type Period, currentSlot } from '../rotation'
import { href } from '../router'
import { type DailySettings, settings, updateDaily } from '../store'

function slotLabel(ms: number, period: number): string {
  const locale = lang.value === 'fa' ? 'fa-IR' : 'en-US'
  const d = new Date(ms)
  return period < 86400
    ? d.toLocaleString(locale, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' })
}

/** Looks like the Lock Screen widget: header, one line of Arabic, two lines of translation. */
function WidgetPreview({ meta, d }: { meta: Meta; d: DailyAyah }) {
  const surah = meta.surahs[d.surah - 1]!
  const tr = d.fa !== undefined ? d.fa : d.en
  const trLang = d.fa !== undefined ? 'fa' : 'en'
  return (
    <div class="lockscreen" aria-label={t('widgetPreview')}>
      <div class="widget" data-testid="widget-preview">
        <p class="w-head">{ayahRef(surah, d.ayah)}</p>
        <p class="w-ar" lang="ar" dir="rtl">{d.ar}</p>
        {tr !== undefined ? <p class="w-tr" lang={trLang} dir={trLang === 'fa' ? 'rtl' : 'ltr'}>{tr || t('mergedTranslation')}</p> : null}
      </div>
    </div>
  )
}

export function Daily({ meta }: { meta: Meta }) {
  const s = settings.value
  const d = s.daily
  const now = useNow(30_000)
  const slot = currentSlot(now, d.period)
  const count = d.period === 86400 ? 7 : 8
  const upcoming = useAsync(
    async () => Promise.all(Array.from({ length: count }, (_, i) => dailyAyah(meta, s, now, i + 1))),
    [slot, JSON.stringify(d), s.script],
  )
  const preview = useAsync(() => dailyAyah(meta, { ...s, script: 'simple' }, now), [slot, JSON.stringify(d)])
  const faList = meta.translations.filter((x) => x.lang === 'fa')
  const enList = meta.translations.filter((x) => x.lang === 'en' && x.id !== 'en.transliteration')
  const pick = (patch: Partial<DailySettings>) => updateDaily(patch)

  return (
    <>
      <DailyCard meta={meta} />
      <p class="muted small tip">{t('dailyHelp')}</p>

      <h2 class="section">{t('settings')}</h2>
      <div class="form">
        <label class="field">
          <span>{t('changes')}</span>
          <select value={d.period} onChange={(e) => pick({ period: Number(e.currentTarget.value) as Period })}>
            <option value={3600}>{t('hourly')}</option>
            <option value={10800}>{t('every3h')}</option>
            <option value={86400}>{t('daily')}</option>
          </select>
        </label>
        <label class="field">
          <span>{t('shows')}</span>
          <select value={d.show} onChange={(e) => pick({ show: e.currentTarget.value as DailySettings['show'] })}>
            <option value="fa">{t('showFa')}</option>
            <option value="en">{t('showEn')}</option>
            <option value="both">{t('showBoth')}</option>
            <option value="ar">{t('showAr')}</option>
          </select>
        </label>
        <label class="field">
          <span>{t('persianTranslation')}</span>
          <select value={d.fa} onChange={(e) => pick({ fa: e.currentTarget.value })}>
            {faList.map((x) => <option value={x.id} key={x.id}>{x.name}{x.translator && x.translator !== x.name ? ` · ${x.translator}` : ''}</option>)}
          </select>
        </label>
        <label class="field">
          <span>{t('englishTranslation')}</span>
          <select value={d.en} onChange={(e) => pick({ en: e.currentTarget.value })}>
            {enList.map((x) => <option value={x.id} key={x.id}>{x.name}{x.translator && x.translator !== x.name ? ` · ${x.translator}` : ''}</option>)}
          </select>
        </label>
        <label class="field">
          <span>{t('drawsFrom')}</span>
          <select value={d.pool} onChange={(e) => pick({ pool: e.currentTarget.value as DailySettings['pool'] })}>
            <option value="all">{t('poolAll')}</option>
            <option value="fits">{t('poolFits')}</option>
          </select>
        </label>
      </div>
      {upcoming.value?.[0] ? <p class="muted small">{poolName(d) === 'all' ? '' : `${poolName(d)} · `}{t('poolSize', { n: upcoming.value[0].poolSize })}</p> : null}

      <h2 class="section">{t('widgetPreview')}</h2>
      {preview.value ? <WidgetPreview meta={meta} d={preview.value} /> : null}

      <h2 class="section"><Icon name="clock" size={18} /> {t('upcoming')}</h2>
      <ul class="list">
        {(upcoming.value ?? []).map((u) => (
          <li key={u.slot}>
            <a class="row" href={href.ayah(u.surah, u.ayah)}>
              <span class="row-main">
                <strong>{ayahRef(meta.surahs[u.surah - 1]!, u.ayah)}</strong>
                <span class="muted small">{slotLabel(u.startsAt, d.period)}</span>
              </span>
              <span class="row-ar" lang="ar" dir="rtl">{meta.surahs[u.surah - 1]!.ar}</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  )
}
