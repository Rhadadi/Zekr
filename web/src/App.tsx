import { useEffect, useRef } from 'preact/hooks'
import { initAudio } from './audio'
import { MainMenu } from './components/MainMenu'
import { Icon } from './components/Icon'
import { LoadError, Loading } from './components/Page'
import { PlayerBar } from './components/PlayerBar'
import { type Meta, ayahIdOf, loadMeta, pageOf } from './data'
import { useAsync } from './hooks'
import { t } from './i18n'
import { type Base, type Layer, type LayerName, closeLayer, mushafAt, route } from './router'
import { lastRead } from './store'
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

/** Where the mushaf is: a page, and the ayah to select there, if any. */
function placeOf(m: Meta, base: Base): { pageNo: number; focusId?: number } {
  if ('page' in base) return { pageNo: base.page }
  const surah = m.surahs[base.surah - 1] ?? m.surahs[0]!
  const id = ayahIdOf(m, surah.id, Math.min(base.ayah ?? 1, surah.ayahs))
  return { pageNo: pageOf(m, id), focusId: base.select ? id : undefined }
}

/** The screen over the mushaf for a layer. */
function layerView(m: Meta, layer: Layer, query: URLSearchParams) {
  switch (layer.name) {
    case 'study': return <Reader key={layer.surah} meta={m} surahId={layer.surah!} ayah={layer.ayah} />
    case 'commentary': return <CommentaryView key={`${layer.surah}:${layer.ayah}`} meta={m} surah={layer.surah!} ayah={layer.ayah!} />
    case 'intro': return <IntroView key={layer.surah} meta={m} surah={layer.surah!} />
    case 'tafsir': return <TafsirView meta={m} surah={layer.surah!} ayah={layer.ayah!} />
    case 'index': return <IndexView meta={m} tab={query.get('tab') === 'juz' ? 'juz' : 'surah'} />
    case 'daily': return <Daily meta={m} />
    case 'search': return <SearchView meta={m} initial={query.get('q') ?? ''} />
    case 'saved': return <Saved meta={m} />
    case 'settings': return <SettingsView meta={m} />
    case 'about': return <About meta={m} />
    default: return <Home meta={m} />
  }
}

/** Every screen but the mushaf: fixed over it, with its own scrolling, closing back to the same place. */
function LayerFrame({ children }: { children: preact.ComponentChildren }) {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    root.current?.focus({ preventScroll: true })
    const key = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && closeLayer()
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])
  return (
    <div class="layer" ref={root} tabIndex={-1}>
      <div class="layer-inner">
        <div class="layer-bar">
          <button class="icon-btn layer-close" onClick={closeLayer} aria-label={t('close')}>
            <Icon name="close" size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function App() {
  const meta = useAsync(loadMeta, [])
  useEffect(() => {
    if (meta.value) {
      initAudio(meta.value)
      void checkTafsir()
    }
  }, [meta.value])
  const r = route.value
  const layer = r.layer
  // The mushaf opens where you left off (fixed at the first draw), and after that only moves when a link asks it to.
  const start = useRef<Base>()
  const at = mushafAt.value
  // the Quran item stands for the mushaf and for the index of surahs
  const active: LayerName = layer ? (layer.name === 'daily' ? 'today' : layer.name === 'about' ? 'settings' : layer.name) : 'index'

  let content
  if (meta.error) content = <LoadError retry={meta.retry} />
  else if (!meta.value) content = <Loading />
  else {
    const m = meta.value
    if (!start.current) start.current = { surah: (lastRead.peek() ?? { surah: 1 }).surah, ayah: (lastRead.peek() ?? { ayah: 1 }).ayah }
    const place = placeOf(m, at ?? start.current)
    content = (
      <>
        {/* inert: while a layer is open nothing under it can be reached with the keyboard or a screen reader */}
        <div class="mushaf-host" {...(layer ? { inert: true } : {})}>
          <PageReader key="mushaf" meta={m} pageNo={place.pageNo} focusId={place.focusId} paused={!!layer} />
        </div>
        {layer ? <LayerFrame key={layer.name}>{layerView(m, layer, r.query)}</LayerFrame> : null}
      </>
    )
  }

  return (
    <div class="app">
      <main id="main">{content}</main>
      {meta.value ? <PlayerBar meta={meta.value} /> : null}
      <MainMenu active={active} />
      {toast.value ? <div class="toast" role="status">{toast.value}</div> : null}
    </div>
  )
}
