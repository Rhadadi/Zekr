import { useEffect, useRef } from 'preact/hooks'
import type { Meta } from '../data'
import { t } from '../i18n'
import { type LayerName, href } from '../router'
import { useDocked } from '../hooks'
import { dockOpen, drawerOpen, gotoOpen, pageOptionsAsked, setDock } from '../ui'
import { SettingsView } from '../views/Settings'
import { Logo } from './AppBar'
import { Icon } from './Icon'

/** The menu: everything in one panel. At the top the name (back to the mushaf), a search field, Today and Saved, and
 * on the mushaf its reading options; below them all the settings, recitation included, to change in place. It opens
 * from the end side, where its button is (the left in Persian), traps focus, and closes on Escape, on the backdrop, on
 * a choice and on Back. */
export function Drawer({ meta, active, onMushaf = false }: { meta?: Meta; active: LayerName; onMushaf?: boolean }) {
  const open = drawerOpen.value
  // in a wide window the menu is a panel docked beside the page instead: not modal, the page stays in use beside it
  const docked = useDocked()
  const dockShown = docked && dockOpen.value
  useEffect(() => {
    document.documentElement.toggleAttribute('data-dock', dockShown)
    return () => document.documentElement.removeAttribute('data-dock')
  }, [dockShown])
  const panel = useRef<HTMLElement>(null)
  // Back closes the drawer: opening it adds one history entry for the same address.
  const pushed = useRef(false)
  const opener = useRef<Element | null>(null)

  useEffect(() => {
    if (!open) return
    opener.current = document.activeElement
    history.pushState(history.state, '')
    pushed.current = true
    panel.current?.querySelector<HTMLElement>('a')?.focus()
    const onPop = () => {
      pushed.current = false
      drawerOpen.value = false
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      } else if (e.key === 'Tab') {
        const focusable = panel.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input, select')
        if (!focusable?.length) return
        const first = focusable[0]!
        const last = focusable[focusable.length - 1]!
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('popstate', onPop)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('popstate', onPop)
      document.removeEventListener('keydown', onKey)
      // after the page behind has become reachable again; inert already dropped focus to <body> when it opened
      const o = opener.current as HTMLElement | null
      const back = o && o !== document.body ? o : document.querySelector<HTMLElement>('.burger')
      setTimeout(() => back?.focus?.(), 0)
    }
  }, [open])

  function close() {
    if (pushed.current) {
      pushed.current = false
      history.back() // the popstate that follows closes it
    } else drawerOpen.value = false
  }

  function go(e: MouseEvent, to: string) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    goTo(to)
  }
  function goTo(to: string) {
    if (to === location.hash) return close()
    // the history entry the drawer added becomes the place we are going to, so Back does not land on a twin of the page
    drawerOpen.value = false
    if (pushed.current) {
      pushed.current = false
      history.replaceState(null, '')
      location.replace(to)
    } else location.hash = to
  }

  const body = (nav: ((e: MouseEvent, to: string) => void) | undefined, navTo: (to: string) => void, closeAfter: boolean) => {
    const link = (to: string, name: LayerName, icon: 'sun' | 'bookmark', label: string) => (
      <a href={to} class={active === name ? 'on' : ''} aria-current={active === name ? 'page' : undefined} onClick={nav ? (e) => nav(e, to) : undefined}>
        <Icon name={icon} size={20} />
        <span>{label}</span>
      </a>
    )
    return (
      <div class="drawer-body">
        <form class="drawer-search" role="search" onSubmit={(e) => {
          e.preventDefault()
          const q = new FormData(e.currentTarget).get('q')?.toString().trim() ?? ''
          navTo(href.search(q))
        }}>
          <input type="search" name="q" enterKeyHint="search" placeholder={t('searchPlaceholder')} aria-label={t('navSearch')} />
          <button type="submit" class="icon-btn" aria-label={t('navSearch')}><Icon name="search" size={20} /></button>
        </form>
        <nav class="drawer-links" aria-label="Main">
          <button class="drawer-item" onClick={() => { if (closeAfter) close(); gotoOpen.value = true }}>
            <Icon name="goto" size={20} />
            <span>{t('goTo')}</span>
          </button>
          {link(href.today, 'today', 'sun', t('navToday'))}
          {link(href.saved, 'saved', 'bookmark', t('navBookmarks'))}
          {onMushaf ? (
            <button class="drawer-item" onClick={() => { if (closeAfter) close(); pageOptionsAsked.value++ }}>
              <Icon name="sliders" size={20} />
              <span>{t('pageOptions')}</span>
            </button>
          ) : null}
        </nav>
        {meta ? <div class="drawer-settings"><SettingsView meta={meta} /></div> : null}
      </div>
    )
  }

  if (dockShown) {
    return (
      <aside id="dock" class="drawer docked" aria-label={t('menu')}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !e.defaultPrevented) {
            e.preventDefault()
            setDock(false)
            document.querySelector<HTMLElement>('.burger')?.focus()
          }
        }}>
        <div class="drawer-head">
          <strong class="dock-title">{t('menu')}</strong>
          <button class="icon-btn" onClick={() => setDock(false)} aria-label={t('close')}><Icon name="close" size={20} /></button>
        </div>
        {body(undefined, (to) => { location.hash = to }, false)}
      </aside>
    )
  }

  if (!open) return null
  return (
    <div class="drawer-wrap">
      <div class="drawer-backdrop" onClick={close} />
      <aside
        class="drawer" ref={panel} role="dialog" aria-modal="true" aria-label={t('menu')}
        // a link further down (About, in the settings) leaves the menu as the ones above do
        onClick={(e) => {
          const a = (e.target as Element).closest<HTMLAnchorElement>('.drawer-body a[href^="#"]')
          if (a && !a.closest('.drawer-links')) go(e, a.getAttribute('href')!)
        }}
      >
        <div class="drawer-head">
          <a class="drawer-logo" href={href.start} onClick={(e) => go(e, href.start)}><Logo /></a>
          <button class="icon-btn" onClick={close} aria-label={t('close')}><Icon name="close" size={20} /></button>
        </div>
        {body(go, goTo, true)}
      </aside>
    </div>
  )
}
