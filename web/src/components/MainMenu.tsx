import { useEffect, useRef, useState } from 'preact/hooks'
import { t } from '../i18n'
import { type LayerName, href } from '../router'
import { Icon, type IconName } from './Icon'

const ITEMS: { name: LayerName; href: string; icon: IconName; label: () => string }[] = [
  { name: 'index', href: href.index, icon: 'list', label: () => t('navIndex') },
  { name: 'today', href: href.today, icon: 'sun', label: () => t('navToday') },
  { name: 'search', href: href.search(), icon: 'search', label: () => t('navSearch') },
  { name: 'saved', href: href.saved, icon: 'bookmark', label: () => t('navBookmarks') },
  { name: 'settings', href: href.settings, icon: 'settings', label: () => t('navSettings') },
]

/** The one small button at the top left that replaces the bottom bar: Quran, Today, Search, Saved, Settings. */
export function MainMenu({ active }: { active: LayerName }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const outside = (e: Event) => {
      if (!wrap.current?.contains(e.target as Node)) close()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('hashchange', close)
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('hashchange', close)
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  return (
    <div class="menu-wrap" ref={wrap}>
      <button class="menu-btn" aria-label={t('menu')} aria-expanded={open} aria-controls="main-menu" onClick={() => setOpen(!open)}>
        <Icon name={open ? 'close' : 'list'} size={20} />
      </button>
      {open ? (
        <nav class="menu-pop" id="main-menu" aria-label="Main">
          {ITEMS.map((n) => (
            <a key={n.name} href={n.href} class={active === n.name ? 'on' : ''} aria-current={active === n.name ? 'page' : undefined} onClick={() => setOpen(false)}>
              <Icon name={n.icon} size={20} />
              <span>{n.label()}</span>
            </a>
          ))}
        </nav>
      ) : null}
    </div>
  )
}
