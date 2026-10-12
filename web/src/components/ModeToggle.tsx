import { t } from '../i18n'

/** Switch between verse-by-verse and mushaf-page reading. */
export function ModeToggle({ current, onPick }: { current: 'verse' | 'page'; onPick: (mode: 'verse' | 'page') => void }) {
  return (
    <div class="tabs mode-toggle" role="group" aria-label={t('readingView')}>
      <button type="button" class={current === 'verse' ? 'on' : ''} aria-pressed={current === 'verse'} onClick={() => onPick('verse')}>
        {t('readVerses')}
      </button>
      <button type="button" class={current === 'page' ? 'on' : ''} aria-pressed={current === 'page'} onClick={() => onPick('page')}>
        {t('readPage')}
      </button>
    </div>
  )
}
