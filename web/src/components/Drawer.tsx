import { useEffect, useRef } from 'preact/hooks'
import { t } from '../i18n'
import { type LayerName, href } from '../router'
import { drawerOpen } from '../ui'
import { Icon, type IconName } from './Icon'

const ITEMS: { name: LayerName; href: string; icon: IconName; label: () => string }[] = [
  { name: 'index', href: href.index, icon: 'list', label: () => t('navIndex') },
  { name: 'today', href: href.today, icon: 'sun', label: () => t('navToday') },
  { name: 'search', href: href.search(), icon: 'search', label: () => t('navSearch') },
  { name: 'saved', href: href.saved, icon: 'bookmark', label: () => t('navBookmarks') },
  { name: 'settings', href: href.settings, icon: 'settings', label: () => t('navSettings') },
]

/** The navigation drawer: Quran, Today, Search, Saved, Settings. It opens from the start side (the right in Persian),
 * traps focus, and closes on Escape, on the backdrop, on a choice and on Back. */
export function Drawer({ active }: { active: LayerName }) {
  const open = drawerOpen.value
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
        const focusable = panel.current?.querySelectorAll<HTMLElement>('a[href], button')
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
    if (to === location.hash) return close()
    // the history entry the drawer added becomes the place we are going to, so Back does not land on a twin of the page
    drawerOpen.value = false
    if (pushed.current) {
      pushed.current = false
      history.replaceState(null, '')
      location.replace(to)
    } else location.hash = to
  }

  if (!open) return null
  return (
    <div class="drawer-wrap">
      <div class="drawer-backdrop" onClick={close} />
      <aside class="drawer" ref={panel} role="dialog" aria-modal="true" aria-label={t('menu')}>
        <div class="drawer-head">
          <strong>{t('appName')}</strong>
          <button class="icon-btn" onClick={close} aria-label={t('close')}><Icon name="close" size={20} /></button>
        </div>
        <nav aria-label="Main">
          {ITEMS.map((n) => (
            <a key={n.name} href={n.href} class={active === n.name ? 'on' : ''} aria-current={active === n.name ? 'page' : undefined} onClick={(e) => go(e, n.href)}>
              <Icon name={n.icon} size={22} />
              <span>{n.label()}</span>
            </a>
          ))}
        </nav>
      </aside>
    </div>
  )
}
