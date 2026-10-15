import { t } from '../i18n'
import { href } from '../router'
import { Icon } from './Icon'

interface Props {
  pageNo: number
  juz: number
  onPlay: () => void
  onVerseView: () => void
  onJump: () => void
  onClose: () => void
}

/** What the page's options button shows: play from this page, go to a page, the Study view, and a way to all settings. */
export function PageOptions({ pageNo, juz, onPlay, onVerseView, onJump, onClose }: Props) {
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
          <button class="btn" onClick={onJump}>
            <Icon name="list" size={18} /> {t('goToPage')}
          </button>
          <button class="btn" onClick={onVerseView}>
            <Icon name="list" size={18} /> {t('openVerseView')}
          </button>
        </div>
        <a class="link-row small" href={href.settings}>{t('allSettings')}</a>
      </div>
    </div>
  )
}
