import { useState } from 'preact/hooks'
import { PlaybackOptions } from '../components/PlaybackOptions'
import { type Meta, type Script, downloadAll } from '../data'
import { QURAN_FONTS, type QuranFont } from '../fonts'
import { useWide } from '../hooks'
import { lang, t } from '../i18n'
import { href } from '../router'
import { type PageColor, type TranslationPlace, settings, updateSettings } from '../store'

export function SettingsView({ meta }: { meta: Meta }) {
  const wide = useWide()
  const s = settings.value
  const [dl, setDl] = useState<{ done: number; total: number; state: 'idle' | 'running' | 'ok' | 'failed' }>({ done: 0, total: 0, state: 'idle' })
  const toggleTranslation = (id: string, on: boolean) =>
    updateSettings({ translations: on ? [...s.translations, id] : s.translations.filter((x) => x !== id) })
  const download = async () => {
    setDl({ done: 0, total: 0, state: 'running' })
    try {
      await downloadAll((done, total) => setDl({ done, total, state: 'running' }))
      setDl((d) => ({ ...d, state: 'ok' }))
    } catch {
      setDl((d) => ({ ...d, state: 'failed' }))
    }
  }
  const group = (code: 'fa' | 'en', title: string) => (
    <fieldset class="checks">
      <legend>{title}</legend>
      {meta.translations.filter((x) => x.lang === code).map((x) => (
        <label class="field row" key={x.id}>
          <input type="checkbox" checked={s.translations.includes(x.id)} onChange={(e) => toggleTranslation(x.id, e.currentTarget.checked)} />
          <span>{x.name}{x.translator && x.translator !== x.name ? <span class="muted small"> · {x.translator}</span> : null}</span>
        </label>
      ))}
    </fieldset>
  )
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
            {meta.mushaf ? null : <option value="inline">{t('pageTranslationInline')}</option>}
            <option value="off">{t('pageTranslationOff')}</option>
          </select>
          {s.translationPlace === 'inline' ? <span class="muted small hint">{t('inlineHint')}</span> : null}
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
          <select value={s.quranFont} onChange={(e) => updateSettings({ quranFont: e.currentTarget.value as QuranFont })}>
            {QURAN_FONTS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label class="field">
          <span>{t('arabicSize')}</span>
          <input type="range" min={22} max={52} step={1} value={s.arabicSize} onInput={(e) => updateSettings({ arabicSize: Number(e.currentTarget.value) })} />
        </label>
        <label class="field">
          <span>{t('trSize')}</span>
          <input type="range" min={14} max={28} step={1} value={s.trSize} onInput={(e) => updateSettings({ trSize: Number(e.currentTarget.value) })} />
        </label>
      </div>
      <div class="sample card">
        <p class="ar" lang="ar" dir="rtl" style={{ fontSize: `${s.arabicSize}px` }}>{meta.basmala[s.script]}</p>
        <p class="tr" lang={lang.value} style={{ fontSize: `${s.trSize}px` }}>{lang.value === 'fa' ? 'به نام خداوند رحمتگر مهربان' : 'In the name of Allah, the Entirely Merciful, the Especially Merciful.'}</p>
      </div>

      <h2 class="section">{t('translations')}</h2>
      <p class="muted small">{t('translationsHint')}</p>
      {group('fa', t('persian'))}
      {group('en', t('english'))}

      <h2 class="section">{t('recitation')}</h2>
      <PlaybackOptions />

      <h2 class="section">{t('offline')}</h2>
      <p class="muted small">{t('offlineHint')}</p>
      <button class="btn" onClick={download} disabled={dl.state === 'running'}>{t('downloadAll')}</button>
      {dl.state === 'running' ? <p role="status" class="small">{t('downloading', { done: dl.done, total: dl.total })}</p> : null}
      {dl.state === 'ok' ? <p role="status" class="small">{t('downloaded')}</p> : null}
      {dl.state === 'failed' ? <p role="alert" class="small">{t('downloadFailed')}</p> : null}

      <p class="link-row"><a href={href.about}>{t('about')}</a></p>
    </>
  )
}
