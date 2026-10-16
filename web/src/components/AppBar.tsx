import type { ComponentChildren } from 'preact'
import { t } from '../i18n'
import { drawerOpen } from '../ui'
import { Icon } from './Icon'

/** The one bar for the mushaf and every layer: a start slot (the logo on the mushaf, Close on a layer), a centre, and
 * at the end the burger that opens the drawer (the left in Persian, the right in English). */
export function AppBar({ start, centre, sticky = false }: { start?: ComponentChildren; centre?: ComponentChildren; sticky?: boolean }) {
  return (
    <header class={`appbar${sticky ? ' sticky' : ''}`}>
      <div class="appbar-in">
        <div class="appbar-start">{start}</div>
        <div class="appbar-centre">{centre}</div>
        <button class="icon-btn burger" aria-label={t('menu')} aria-haspopup="dialog" aria-expanded={drawerOpen.value} onClick={() => (drawerOpen.value = true)}>
          <Icon name="list" size={22} />
        </button>
      </div>
    </header>
  )
}

/** Zekr's name in nastaliq, in the colour of the theme. */
export function Logo() {
  return <span class="logo" role="img" aria-label={t('appName')} />
}
