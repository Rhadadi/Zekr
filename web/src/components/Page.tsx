import { t } from '../i18n'

export function Loading() {
  return <p class="status" role="status">{t('loading')}</p>
}

export function LoadError({ retry }: { retry: () => void }) {
  return (
    <div class="status" role="alert">
      <p>{t('loadFailed')}</p>
      <button class="btn" onClick={retry}>{t('retry')}</button>
    </div>
  )
}
