import { useEffect } from 'preact/hooks'
import { initAudio } from './audio'
import { MainMenu } from './components/MainMenu'
import { LoadError, Loading } from './components/Page'
import { PlayerBar } from './components/PlayerBar'
import { ayahIdOf, loadMeta, pageOf } from './data'
import { useAsync } from './hooks'
import { type RouteName, route } from './router'
import { lastRead, settings } from './store'
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
import { TafsirView } from './views/Tafsir'
import { CommentaryView, IntroView } from './views/Commentary'
import { checkTafsir } from './tafsir'

export function App() {
  const meta = useAsync(loadMeta, [])
  useEffect(() => {
    if (meta.value) {
      initAudio(meta.value)
      void checkTafsir()
    }
  }, [meta.value])
  const r = route.value
  const active: RouteName = r.name === 'start' || r.name === 'reader' || r.name === 'page' || r.name === 'tafsir' || r.name === 'commentary' || r.name === 'intro' ? 'index' : r.name === 'daily' ? 'home' : r.name === 'about' ? 'settings' : r.name

  let view
  if (meta.error) view = <LoadError retry={meta.retry} />
  else if (!meta.value) view = <Loading />
  else {
    const m = meta.value
    switch (r.name) {
      case 'start': {
        // The Quran where you left off, in the reading view chosen in Settings.
        const last = lastRead.peek() ?? { surah: 1, ayah: 1 }
        const surah = m.surahs[last.surah - 1] ?? m.surahs[0]!
        const id = ayahIdOf(m, surah.id, Math.min(last.ayah, surah.ayahs))
        view = settings.value.readMode === 'page'
          ? <PageReader key="page" meta={m} pageNo={pageOf(m, id)} />
          : <Reader key={`${surah.id}`} meta={m} surahId={surah.id} ayah={last.ayah > 1 ? last.ayah : undefined} />
        break
      }
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
      case 'commentary': view = <CommentaryView key={`${r.surah}:${r.ayah}`} meta={m} surah={r.surah!} ayah={r.ayah!} />; break
      case 'intro': view = <IntroView key={r.surah} meta={m} surah={r.surah!} />; break
      case 'tafsir': view = <TafsirView meta={m} surah={r.surah!} ayah={r.ayah!} />; break
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
      <MainMenu active={active} />
      {toast.value ? <div class="toast" role="status">{toast.value}</div> : null}
    </div>
  )
}
