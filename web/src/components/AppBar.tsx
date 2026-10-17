import type { ComponentChildren } from 'preact'
import { useDocked } from '../hooks'
import { lang, t } from '../i18n'
import { dockOpen, drawerOpen, setDock } from '../ui'
import { Icon } from './Icon'

/** The one bar for the mushaf and every layer. It is the same way round in both languages: the burger that opens the
 * drawer at the left, the name (on the mushaf) or Close (on a layer) at the right, and the centre between them. */
export function AppBar({ start, centre, sticky = false }: { start?: ComponentChildren; centre?: ComponentChildren; sticky?: boolean }) {
  // in a wide window the menu is a panel beside the page that the burger shows and hides; otherwise a drawer over it
  const docked = useDocked()
  const burger = (
    <button class="icon-btn burger" aria-label={t('menu')} aria-haspopup={docked ? undefined : 'dialog'} aria-controls={docked ? 'dock' : undefined}
      aria-expanded={docked ? dockOpen.value : drawerOpen.value} onClick={() => (docked ? setDock(!dockOpen.value) : (drawerOpen.value = true))}>
      <Icon name="list" size={22} />
    </button>
  )
  const brand = <div class="appbar-start">{start}</div>
  const mid = <div class="appbar-centre">{centre}</div>
  // in the order of reading, so Tab follows the language: right to left in Persian
  return (
    <header class={`appbar${sticky ? ' sticky' : ''}`}>
      <div class="appbar-in">{lang.value === 'fa' ? <>{brand}{mid}{burger}</> : <>{burger}{mid}{brand}</>}</div>
    </header>
  )
}

/** Zekr's name in nastaliq, in the colour of the theme. */
export function Logo() {
  return <span class="logo" role="img" aria-label={t('appName')} />
}
