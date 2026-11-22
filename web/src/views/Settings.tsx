import { useState } from 'preact/hooks'
import { TR_MAX, TR_MIN } from '../components/PageOptions'
import { PlaybackOptions } from '../components/PlaybackOptions'
import { type Meta, type Script, downloadAll } from '../data'
import { QURAN_FONTS } from '../fonts'
import { useWide } from '../hooks'
import { lang, t } from '../i18n'
import { href } from '../router'
import { type PageColor, type TranslationPlace, pickFont, settings, updateSettings, quranText } from '../store'

/** The translations to show, Persian then English: a pill for each, on or off (a checkbox inside, for screen readers).
 * The translator's full name is the pill's tooltip. */
export function TranslationChecks({ meta }: { meta: Meta }) {
  const s = settings.value
  const toggle = (id: string, on: boolean) => updateSettings({ translations: on ? [...s.translations, id] : s.translations.filter((x) => x !== id) })
  const group = (code: 'fa' | 'en', title: string) => (
    <fieldset class="checks">
      <legend>{title}</legend>
      <div class="chips">
        {meta.translations.filter((x) => x.lang === code).map((x) => (
          <label class="chip" key={x.id} title={x.translator && x.translator !== x.name ? x.translator : undefined}>
            <input type="checkbox" checked={s.translations.includes(x.id)} onChange={(e) => toggle(x.id, e.currentTarget.checked)} />
            <span>{x.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
  return <>{group('fa', t('persian'))}{group('en', t('english'))}</>
}

/** Download everything for offline use, with its progress. */
export function OfflineDownload() {
  const [dl, setDl] = useState<{ done: number; total: number; state: 'idle' | 'running' | 'ok' | 'failed' }>({ done: 0, total: 0, state: 'idle' })
  const download = async () => {
    setDl({ done: 0, total: 0, state: 'running' })
    try {
      await downloadAll((done, total) => setDl({ done, total, state: 'running' }))
      setDl((d) => ({ ...d, state: 'ok' }))
    } catch {
      setDl((d) => ({ ...d, state: 'failed' }))
    }
  }
  return (
    <>
      <button class="btn" onClick={download} disabled={dl.state === 'running'}>{t('downloadAll')}</button>
      {dl.state === 'running' ? <p role="status" class="small">{t('downloading', { done: dl.done, total: dl.total })}</p> : null}
      {dl.state === 'ok' ? <p role="status" class="small">{t('downloaded')}</p> : null}
      {dl.state === 'failed' ? <p role="alert" class="small">{t('downloadFailed')}</p> : null}
    </>
  )
}

export function SettingsView({ meta }: { meta: Meta }) {
  const wide = useWide()
  const s = settings.value
  return (
    <>
      <div class="form">
        <label class="field">
          <span>{t('language')}</span>
          <select value={s.lang} onChange={(e) => updateSettings({ lang: e.currentTarget.value as typeof s.lang })}>
            <option value="auto">{t('langAuto')}</option>
            <option value="fa">فارسی</option>
            <option value="en">English</option>
          </select>
        </label>
        <label class="field">
          <span>{t('theme')}</span>
          <select value={s.theme} onChange={(e) => updateSettings({ theme: e.currentTarget.value as typeof s.theme })}>
            <option value="auto">{t('themeAuto')}</option>
            <option value="light">{t('themeLight')}</option>
            <option value="sepia">{t('themeSepia')}</option>
            <option value="dark">{t('themeDark')}</option>
          </select>
        </label>
        <h2 class="section">{t('reading')}</h2>
        <label class="field">
          <span>{t('pageTranslation')}</span>
          <select value={s.translationPlace} onChange={(e) => updateSettings({ translationPlace: e.currentTarget.value as TranslationPlace })}>
            <option value="panel">{wide ? t('pageTranslationPanel') : t('pageTranslationBottom')}</option>
            <option value="card">{t('pageTranslationPopup')}</option>
            <option value="inline">{meta.mushaf ? t('pageTranslationLines') : t('pageTranslationInline')}</option>
            {meta.wbw ? <option value="words">{t('pageTranslationWords')}</option> : null}
            <option value="off">{t('pageTranslationOff')}</option>
          </select>
          {s.translationPlace === 'inline' ? <span class="muted small hint">{meta.mushaf ? t('linesHint') : t('inlineHint')}</span> : null}
          {s.translationPlace === 'words' ? <span class="muted small hint">{t('wordsHint')}</span> : null}
        </label>
        {meta.mushaf ? (
          <label class="field">
            <span>{t('pageColor')}</span>
            <select value={s.pageColor} onChange={(e) => updateSettings({ pageColor: e.currentTarget.value as PageColor })}>
              <option value="blue">{t('colorBlue')}</option>
              <option value="green">{t('colorGreen')}</option>
              <option value="purple">{t('colorPurple')}</option>
              <option value="pink">{t('colorPink')}</option>
              <option value="dark">{t('colorDark')}</option>
            </select>
          </label>
        ) : null}
        <label class="field">
          <span>{t('script')}</span>
          <select value={s.script} onChange={(e) => updateSettings({ script: e.currentTarget.value as Script })}>
            <option value="uthmani">{t('scriptUthmani')}</option>
            <option value="simple">{t('scriptSimple')}</option>
          </select>
        </label>
        <label class="field">
          <span>{t('quranFont')}</span>
          <select value={meta.mushaf && s.pageStyle !== 'text' ? 'printed' : s.quranFont} onChange={(e) => pickFont(e.currentTarget.value)}>
            {meta.mushaf ? <option value="printed">{t('fontPrinted')}</option> : null}
            {QURAN_FONTS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label class="field">
          <span>{t('arabicSize')}</span>
          <input type="range" min={22} max={52} step={1} value={s.arabicSize} onInput={(e) => updateSettings({ arabicSize: Number(e.currentTarget.value) })} />
        </label>
        <label class="field">
          <span>{t('trSize')}</span>
          <input type="range" min={TR_MIN} max={TR_MAX} step={1} value={s.trSize} onInput={(e) => updateSettings({ trSize: Number(e.currentTarget.value) })} />
        </label>
        <label class="field row">
          <input type="checkbox" checked={s.trBackground} onChange={(e) => updateSettings({ trBackground: e.currentTarget.checked })} />
          <span>{t('trBackground')}</span>
        </label>
      </div>
      <div class="sample card">
        <p class="ar" lang="ar" dir="rtl" style={{ fontSize: `${s.arabicSize}px` }}>{quranText(meta.basmala[s.script])}</p>
        <p class="tr" lang={lang.value} style={{ fontSize: `${s.trSize}px` }}>{lang.value === 'fa' ? 'به نام خداوند رحمتگر مهربان' : 'In the name of Allah, the Entirely Merciful, the Especially Merciful.'}</p>
      </div>

      <h2 class="section">{t('translations')}</h2>
      <p class="muted small">{t('translationsHint')}</p>
      <TranslationChecks meta={meta} />

      <h2 class="section">{t('recitation')}</h2>
      <PlaybackOptions />

      <h2 class="section">{t('offline')}</h2>
      <p class="muted small">{t('offlineHint')}</p>
      {meta.studyQuran?.audio ? <p class="muted small">{t('commentaryDownloadHint', { mb: Math.ceil(meta.studyQuran.audio.bytes / 1e6) })}</p> : null}
      <OfflineDownload />

      <p class="link-row"><a href={href.about}>{t('about')}</a></p>
    </>
  )
}
