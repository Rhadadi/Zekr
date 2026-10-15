import type { ComponentChildren } from 'preact'
import { t } from '../i18n'
import { drawerOpen } from '../ui'
import { Icon } from './Icon'

/** The one bar for the mushaf and every layer: the burger that opens the drawer, a centre, and an end slot. */
export function AppBar({ centre, end, sticky = false }: { centre?: ComponentChildren; end?: ComponentChildren; sticky?: boolean }) {
  return (
    <header class={`appbar${sticky ? ' sticky' : ''}`}>
      <div class="appbar-in">
        <button class="icon-btn burger" aria-label={t('menu')} aria-haspopup="dialog" aria-expanded={drawerOpen.value} onClick={() => (drawerOpen.value = true)}>
          <Icon name="list" size={22} />
        </button>
        <div class="appbar-centre">{centre}</div>
        <div class="appbar-end">{end}</div>
      </div>
    </header>
  )
}
