import type { ComponentChildren } from 'preact'
import { useState } from 'preact/hooks'
import { type Meta, type Script } from '../data'
import { QURAN_FONTS } from '../fonts'
import { useWide } from '../hooks'
import { num, t } from '../i18n'
import { href } from '../router'
import { type PageColor, type Settings, type TranslationPlace, pickFont, settings, updateSettings } from '../store'
import { OfflineDownload, TranslationChecks } from '../views/Settings'
import { Icon, type IconName } from './Icon'
import { PlaybackOptions } from './PlaybackOptions'
import { TR_MAX, TR_MIN } from './PageOptions'

const THEMES: [Settings['theme'], IconName, 'themeAuto' | 'themeLight' | 'themeSepia' | 'themeDark'][] = [
  ['auto', 'auto', 'themeAuto'], ['light', 'sun', 'themeLight'], ['sepia', 'book', 'themeSepia'], ['dark', 'moon', 'themeDark'],
]
// the swatch is the colour the page takes, not a theme colour
const COLORS: [PageColor, string, 'colorBlue' | 'colorGreen' | 'colorPurple' | 'colorPink' | 'colorDark'][] = [
  ['blue', '#3a8fd0', 'colorBlue'], ['green', '#3c9a5f', 'colorGreen'], ['purple', '#8a5cc4', 'colorPurple'], ['pink', '#d0628f', 'colorPink'], ['dark', '#26282a', 'colorDark'],
]

// which folded sections were left open; a convenience, so it may be lost
const OPEN_KEY = 'zekr.menuOpen'
function readOpen(): string[] {
  try { return JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]') as string[] } catch { return [] }
}

function Section({ id, title, children, initiallyOpen = false }: { id: string; title: string; children: ComponentChildren; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(() => initiallyOpen || readOpen().includes(id))
  return (
    <details class="msec" open={open} onToggle={(e) => {
      const now = e.currentTarget.open
      setOpen(now)
      try { localStorage.setItem(OPEN_KEY, JSON.stringify([...readOpen().filter((x) => x !== id), ...(now ? [id] : [])])) } catch { /* not saved */ }
    }}>
      <summary>{title}</summary>
      {open ? <div class="msec-body">{children}</div> : null}
    </details>
  )
}

function Stepper({ label, value, min, max, set }: { label: string; value: number; min: number; max: number; set: (v: number) => void }) {
  return (
    <div class="mrow" role="group" aria-label={label}>
      <span>{label}</span>
      <span class="stepper">
        <button type="button" onClick={() => set(value - 1)} disabled={value <= min} aria-label={`${label} −`}>−</button>
        <output>{num(value)}</output>
        <button type="button" onClick={() => set(value + 1)} disabled={value >= max} aria-label={`${label} +`}>+</button>
      </span>
    </div>
  )
}

/** The settings as the menu shows them: the four used most a tap away (language, the theme and the page colour as
 * buttons, the translation's size as − and +), everything else folded by subject until asked for.
 * The Settings screen keeps the full form with its explanations. */
export function MenuSettings({ meta, study = false }: { meta: Meta; study?: boolean }) {
  const wide = useWide()
  const s = settings.value
  return (
    <div class="menu-settings">
      <label class="mrow">
        <span>{t('language')}</span>
        <select value={s.lang} onChange={(e) => updateSettings({ lang: e.currentTarget.value as Settings['lang'] })}>
          <option value="auto">{t('langAuto')}</option>
          <option value="fa">فارسی</option>
          <option value="en">English</option>
        </select>
      </label>
      <div class="mrow" role="group" aria-label={t('theme')}>
        <span>{t('theme')}</span>
        <span class="seg">
          {THEMES.map(([v, icon, k]) => (
            <button type="button" key={v} aria-pressed={s.theme === v} aria-label={t(k)} title={t(k)} onClick={() => updateSettings({ theme: v })}>
              <Icon name={icon} size={17} />
            </button>
          ))}
        </span>
      </div>
      {meta.mushaf && !study ? (
        <div class="mrow" role="group" aria-label={t('pageColor')}>
          <span>{t('pageColor')}</span>
          <span class="swatches">
            {COLORS.map(([v, c, k]) => (
              <button type="button" key={v} aria-pressed={s.pageColor === v} aria-label={t(k)} title={t(k)} style={{ '--sw': c }} onClick={() => updateSettings({ pageColor: v })} />
            ))}
          </span>
        </div>
      ) : null}
      <Stepper label={t('trSize')} value={s.trSize} min={TR_MIN} max={TR_MAX} set={(v) => updateSettings({ trSize: v })} />
      <Section id="reading" title={t('reading')} initiallyOpen={study}>
        {!study ? <label class="mrow">
          <span>{t('pageTranslation')}</span>
          <select value={s.translationPlace} onChange={(e) => updateSettings({ translationPlace: e.currentTarget.value as TranslationPlace })}>
            <option value="panel">{wide ? t('pageTranslationPanel') : t('pageTranslationBottom')}</option>
            <option value="card">{t('pageTranslationPopup')}</option>
            <option value="inline">{meta.mushaf ? t('pageTranslationLines') : t('pageTranslationInline')}</option>
            {meta.wbw ? <option value="words">{t('pageTranslationWords')}</option> : null}
            <option value="off">{t('pageTranslationOff')}</option>
          </select>
        </label> : null}
        <label class="mrow">
          <span>{t('script')}</span>
          <select value={s.script} onChange={(e) => updateSettings({ script: e.currentTarget.value as Script })}>
            <option value="uthmani">{t('scriptUthmani')}</option>
            <option value="simple">{t('scriptSimple')}</option>
          </select>
        </label>
        <label class="mrow">
          <span>{t('quranFont')}</span>
          <select value={!study && meta.mushaf && s.pageStyle !== 'text' ? 'printed' : s.quranFont} onChange={(e) => study ? updateSettings({ quranFont: e.currentTarget.value as Settings['quranFont'] }) : pickFont(e.currentTarget.value)}>
            {!study && meta.mushaf ? <option value="printed">{t('fontPrinted')}</option> : null}
            {QURAN_FONTS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <Stepper label={t('arabicSize')} value={s.arabicSize} min={22} max={52} set={(v) => updateSettings({ arabicSize: v })} />
      </Section>
      <Section id="translations" title={t('translations')}><TranslationChecks meta={meta} /></Section>
      <Section id="recitation" title={t('recitation')}><PlaybackOptions /></Section>
      <Section id="offline" title={t('offline')}><OfflineDownload /></Section>
      <a class="menu-about" href={href.about}>{t('about')}</a>
    </div>
  )
}
