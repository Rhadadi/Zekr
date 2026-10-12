import { type PlayTo } from '../data'
import { lang, t } from '../i18n'
import { audioTranslations, reciters } from '../reciters'
import { settings, updateSettings } from '../store'

const SPEEDS = [0.75, 1, 1.25, 1.5, 2]
const REPEATS = [1, 2, 3, 5, 10]
const PLAY_TO: [PlayTo, 'toAyah' | 'toPage' | 'toSurah' | 'toJuz' | 'toRub' | 'toQuran'][] = [
  ['ayah', 'toAyah'], ['page', 'toPage'], ['surah', 'toSurah'], ['juz', 'toJuz'], ['rub', 'toRub'], ['quran', 'toQuran'],
]

export function PlaybackOptions() {
  const s = settings.value
  const l = lang.value
  return (
    <div class="form">
      <label class="field">
        <span>{t('reciter')}</span>
        <select value={s.reciter} onChange={(e) => updateSettings({ reciter: e.currentTarget.value })}>
          {reciters.map((r) => <option value={r.id} key={r.id}>{r[l]}</option>)}
        </select>
      </label>
      <label class="field">
        <span>{t('playTo')}</span>
        <select value={s.playTo} onChange={(e) => updateSettings({ playTo: e.currentTarget.value as PlayTo })}>
          {PLAY_TO.map(([v, k]) => <option value={v} key={v}>{t(k)}</option>)}
        </select>
      </label>
      <label class="field">
        <span>{t('speed')}</span>
        <select value={s.speed} onChange={(e) => updateSettings({ speed: Number(e.currentTarget.value) })}>
          {SPEEDS.map((v) => <option value={v} key={v}>{v}×</option>)}
        </select>
      </label>
      <label class="field">
        <span>{t('repeat')}</span>
        <select value={s.repeat} onChange={(e) => updateSettings({ repeat: Number(e.currentTarget.value) })}>
          {REPEATS.map((v) => <option value={v} key={v}>{t('times', { n: v })}</option>)}
        </select>
      </label>
      <label class="field">
        <span>{t('audioTranslation')}</span>
        <select value={s.audioTranslation} onChange={(e) => updateSettings({ audioTranslation: e.currentTarget.value })}>
          <option value="off">{t('off')}</option>
          {audioTranslations.map((a) => <option value={a.id} key={a.id}>{a[l]}</option>)}
        </select>
      </label>
      <label class="field row">
        <input type="checkbox" checked={s.autoScroll} onChange={(e) => updateSettings({ autoScroll: e.currentTarget.checked })} />
        <span>{t('autoScroll')}</span>
      </label>
    </div>
  )
}
