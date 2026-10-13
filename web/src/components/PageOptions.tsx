import { QURAN_FONTS, type QuranFont } from '../fonts'
import { t } from '../i18n'
import { href } from '../router'
import { type PageTranslation, settings, updateSettings } from '../store'
import { Icon } from './Icon'

interface Props {
  pageNo: number
  juz: number
  onPlay: () => void
  onVerseView: () => void
  onClose: () => void
}

/** What tapping the page (not an ayah) shows in the side box: play from here, where translations show, following the recitation, the Quran font and size, and verse view. */
export function PageOptions({ pageNo, juz, onPlay, onVerseView, onClose }: Props) {
  const s = settings.value
  return (
    <div class="page-options" role="region" aria-label={t('pageOptions')} data-testid="page-options" onClick={(e) => e.stopPropagation()}>
      <div class="sheet-head">
        <strong>{t('pageN', { n: pageNo })} · {t('juzN', { n: juz })}</strong>
        <button class="icon-btn" onClick={onClose} aria-label={t('close')}>
          <Icon name="close" size={20} />
        </button>
      </div>
      <div class="sheet-body options-body">
        <div class="options-row">
          <button class="btn primary" onClick={onPlay}>
            <Icon name="play" size={18} /> {t('playFromPage')}
          </button>
          <button class="btn" onClick={onVerseView}>
            <Icon name="list" size={18} /> {t('openVerseView')}
          </button>
        </div>
        <label class="field">
          <span>{t('quranFont')}</span>
          <select value={s.quranFont} onChange={(e) => updateSettings({ quranFont: e.currentTarget.value as QuranFont })}>
            {QURAN_FONTS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label class="field">
          <span>{t('pageTranslation')}</span>
          <select value={s.pageTranslation} onChange={(e) => updateSettings({ pageTranslation: e.currentTarget.value as PageTranslation })}>
            <option value="left">{t('pageTranslationLeft')}</option>
            <option value="right">{t('pageTranslationRight')}</option>
            <option value="popup">{t('pageTranslationPopup')}</option>
          </select>
        </label>
        <label class="field row">
          <input type="checkbox" checked={s.autoScroll} onChange={(e) => updateSettings({ autoScroll: e.currentTarget.checked })} />
          <span>{t('autoScroll')}</span>
        </label>
        <label class="field">
          <span>{t('arabicSize')}</span>
          <input type="range" min={22} max={52} step={1} value={s.arabicSize} onInput={(e) => updateSettings({ arabicSize: Number(e.currentTarget.value) })} />
        </label>
        <a class="link-row small" href={href.settings}>{t('allSettings')}</a>
      </div>
    </div>
  )
}
