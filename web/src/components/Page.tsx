import type { ComponentChildren } from 'preact'
import { t } from '../i18n'
import { Icon } from './Icon'

export function PageHeader({ title, sub, back, actions }: { title: string; sub?: string; back?: string; actions?: ComponentChildren }) {
  return (
    <header class="top">
      {back ? (
        <a class="icon-btn back" href={back} aria-label={t('back')}>
          <Icon name="chevron" />
        </a>
      ) : (
        <span class="top-spacer" />
      )}
      <div class="top-title">
        <h1>{title}</h1>
        {sub ? <p>{sub}</p> : null}
      </div>
      <div class="top-actions">{actions}</div>
    </header>
  )
}

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
