import { useEffect } from 'preact/hooks'
import { initAudio } from './audio'
import { Icon, type IconName } from './components/Icon'
import { LoadError, Loading } from './components/Page'
import { PlayerBar } from './components/PlayerBar'
import { ayahIdOf, loadMeta, pageOf } from './data'
import { useAsync } from './hooks'
import { t } from './i18n'
import { type RouteName, href, route } from './router'
import { settings } from './store'
import { toast } from './toast'
import { About } from './views/About'
import { Daily } from './views/Daily'
import { Home } from './views/Home'
import { IndexView } from './views/Index'
import { PageReader } from './views/PageReader'
import { Reader } from './views/Reader'
import { SearchView } from './views/Search'
import { Saved } from './views/Saved'
import { SettingsView } from './views/Settings'

const NAV: { name: RouteName; href: string; icon: IconName; label: () => string }[] = [
  { name: 'home', href: href.home, icon: 'home', label: () => t('navHome') },
  { name: 'index', href: href.index, icon: 'list', label: () => t('navIndex') },
  { name: 'search', href: href.search(), icon: 'search', label: () => t('navSearch') },
  { name: 'saved', href: href.saved, icon: 'bookmark', label: () => t('navBookmarks') },
  { name: 'settings', href: href.settings, icon: 'settings', label: () => t('navSettings') },
]

export function App() {
  const meta = useAsync(loadMeta, [])
  useEffect(() => {
    if (meta.value) initAudio(meta.value)
  }, [meta.value])
  const r = route.value
  const active: RouteName = r.name === 'reader' || r.name === 'page' ? 'index' : r.name === 'daily' ? 'home' : r.name === 'about' ? 'settings' : r.name

  let view
  if (meta.error) view = <LoadError retry={meta.retry} />
  else if (!meta.value) view = <Loading />
  else {
    const m = meta.value
    switch (r.name) {
      case 'reader':
        if (!r.verse && settings.value.readMode === 'page') {
          const surah = m.surahs[r.surah! - 1]!
          const id = ayahIdOf(m, surah.id, Math.min(r.ayah ?? 1, surah.ayahs))
          view = <PageReader key="page" meta={m} pageNo={pageOf(m, id)} focusId={r.ayah ? id : undefined} />
        } else {
          view = <Reader key={`${r.surah}`} meta={m} surahId={r.surah!} ayah={r.ayah} />
        }
        break
      case 'page': view = <PageReader key="page" meta={m} pageNo={r.page!} />; break
      case 'index': view = <IndexView meta={m} tab={r.query.get('tab') === 'juz' ? 'juz' : 'surah'} />; break
      case 'daily': view = <Daily meta={m} />; break
      case 'search': view = <SearchView meta={m} initial={r.query.get('q') ?? ''} />; break
      case 'saved': view = <Saved meta={m} />; break
      case 'settings': view = <SettingsView meta={m} />; break
      case 'about': view = <About meta={m} />; break
      default: view = <Home meta={m} />
    }
  }

  return (
    <div class="app">
      <main id="main">{view}</main>
      {meta.value ? <PlayerBar meta={meta.value} /> : null}
      <nav class="bottom-nav" aria-label="Main">
        {NAV.map((n) => (
          <a key={n.name} href={n.href} class={active === n.name ? 'on' : ''} aria-current={active === n.name ? 'page' : undefined}>
            <Icon name={n.icon} />
            <span>{n.label()}</span>
          </a>
        ))}
      </nav>
      {toast.value ? <div class="toast" role="status">{toast.value}</div> : null}
    </div>
  )
}
