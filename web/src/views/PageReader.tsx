import { memo } from 'preact/compat'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { player, playFrom } from '../audio'
import { AppBar } from '../components/AppBar'
import { AyahPanel } from '../components/AyahPanel'
import { Icon } from '../components/Icon'
import { LoadError, Loading } from '../components/Page'
import { InterlinearPage } from '../components/InterlinearPage'
import { PageOptions } from '../components/PageOptions'
import { WordsPage } from '../components/WordsPage'
import { Sheet } from '../components/Sheet'
import { SurahBanner } from '../components/SurahBanner'
import { type Meta, type MushafPageMap, type TranslationInfo, juzOf, loadMushafMap, loadText, loadTranslation, locate, mushafImage, pageOf, pageRange } from '../data'
import { useAsync, useWide } from '../hooks'
import { num, surahName, t } from '../i18n'
import { href } from '../router'
import { type TranslationPlace, setLastRead, settings } from '../store'

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩'
/** Ayah numbers inside the text use the traditional Arabic-Indic digits, as printed mushafs do. */
const marker = (n: number) => String(n).replace(/\d/g, (d) => ARABIC_INDIC[Number(d)] as string)
const PAGES = 604

type Panel = { kind: 'ayah'; id: number } | { kind: 'options' } | null

interface PageProps {
  meta: Meta
  n: number
  ar: string[]
  basmala: string
  size: number
  /** The highlighted ayah, when it is on this page (so other pages skip re-rendering). */
  highlight?: number
  /** 'sel' for the ayah being shown, 'playing' for the one being recited. */
  kind?: 'sel' | 'playing'
  /** Translations under every ayah ("inline" placement), one entry per chosen translation. */
  inline?: { info: TranslationInfo[]; texts: string[][]; size: number }
}

/** One mushaf page: a banner and basmala where a surah starts, then flowing ayahs, then the page number. */
const MushafPage = memo(function MushafPage({ meta, n, ar, basmala, size, highlight, kind, inline }: PageProps) {
  const { first, last } = pageRange(meta, n)
  const out: preact.ComponentChildren[] = []
  let run: preact.ComponentChildren[] = []
  const flush = () => {
    if (run.length) out.push(<p class="flow" lang="ar" dir="rtl" key={`f${out.length}`} style={{ fontSize: `${size}px` }}>{run}</p>)
    run = []
  }
  for (let id = first; id <= last; id++) {
    const at = locate(meta, id)
    if (at.ayah === 1) {
      flush()
      const surah = meta.surahs[at.surah - 1]!
      out.push(<SurahBanner key={`b${at.surah}`} name={surah.ar} />)
      if (at.surah !== 1 && at.surah !== 9) {
        out.push(<p class="basmala" lang="ar" dir="rtl" key={`s${at.surah}`} style={{ fontSize: `${size}px` }}>{basmala}</p>)
      }
    }
    run.push(
      <span key={id} class={`ay${highlight === id ? ` ${kind}` : ''}`} data-id={id} role="button" tabIndex={0}>
        {ar[id - 1]} <span class="mark">﴿{marker(at.ayah)}﴾</span>
      </span>,
      ' ',
    )
    if (inline) {
      flush()
      out.push(
        <div class="tr-inline" key={`t${id}`}>
          {inline.info.map((info, k) => (
            <p class="tr" key={info.id} lang={info.lang} dir={info.dir} style={{ fontSize: `${inline.size}px` }}>{inline.texts[k]![id - 1] || t('mergedTranslation')}</p>
          ))}
        </div>,
      )
    }
  }
  flush()
  return (
    <section class="mpage" id={`page-${n}`} data-page={n} aria-label={t('pageN', { n })}>
      {out}
      <div class="page-no" aria-hidden="true"><span>{num(n)}</span></div>
    </section>
  )
})

/** Where an ayah is on screen: the line rectangles on a printed page, or the lines of its text. */
const ayahEl = (id: number) => document.querySelector(`.ay[data-id="${id}"] .seg`) ?? document.querySelector(`.ay[data-id="${id}"]`)
function ayahRects(id: number): DOMRect[] {
  const el = document.querySelector(`.ay[data-id="${id}"]`)
  if (!el) return []
  const segs = el.querySelectorAll('.seg')
  return segs.length ? Array.from(segs, (x) => x.getBoundingClientRect()) : Array.from(el.getClientRects())
}

interface PrintedProps {
  meta: Meta
  pg: MushafPageMap
  ar: string[]
  highlight?: number
  kind?: 'sel' | 'playing'
  onJump: () => void
}

/** One page of the owner's printed mushaf as a picture, with a tappable area over each ayah. */
const PrintedPage = memo(function PrintedPage({ meta, pg, ar, highlight, kind, onJump }: PrintedProps) {
  const n = pg.n
  return (
    <section class="mpage printed" id={`page-${n}`} data-page={n} aria-label={t('pageN', { n })}>
      <div class="pg" style={{ aspectRatio: `${pg.w} / ${pg.h}` }}>
        <img class="pg-img" src={mushafImage(meta, n)} alt="" decoding="async" draggable={false} />
        {pg.a.map((segs, k) => {
          const id = pg.first + k
          const at = locate(meta, id)
          return (
            <span key={id} class={`ay${highlight === id ? ` ${kind}` : ''}`} data-id={id} role="button" tabIndex={0}>
              <span class="visually-hidden">{at.surah}:{at.ayah} {ar[id - 1]}</span>
              {segs.map(([x, y, w, h], i) => (
                <i key={i} class="seg" style={{ left: `${x / 10}%`, top: `${y / 10}%`, width: `${w / 10}%`, height: `${h / 10}%` }} />
              ))}
            </span>
          )
        })}
        {n > 2 ? <button class="pg-no" aria-hidden="true" tabIndex={-1} onClick={(e) => { e.stopPropagation(); onJump() }} /> : null}
      </div>
    </section>
  )
})

/** The mushaf as one scrolling text, page after page. Tap (or hover, if chosen) an ayah for its translation;
 * tap the page for reading options. While reciting, the ayah being recited is highlighted and kept in view. */
export function PageReader({ meta, pageNo, focusId, paused = false }: { meta: Meta; pageNo: number; focusId?: number; paused?: boolean }) {
  const s = settings.value
  const trKey = s.translations.join(',')
  const data = useAsync(async () => {
    const ids = s.translations.filter((id) => meta.translations.some((x) => x.id === id))
    const [ar, ...trs] = await Promise.all([loadText(s.script), ...ids.map((id) => loadTranslation(id))])
    return { ar, trs, ids }
  }, [s.script, trKey])

  const printed = !!meta.mushaf
  const map = useAsync(() => (printed ? loadMushafMap() : Promise.resolve(null)), [printed])
  const ready = !!data.value && (!printed || !!map.value)

  const [panel, setPanel] = useState<Panel>(focusId ? { kind: 'ayah', id: focusId } : null)
  const [hoverId, setHoverId] = useState<number | undefined>(undefined)
  const [current, setCurrent] = useState(pageNo)
  const [jumping, setJumping] = useState(false)
  const [menu, setMenu] = useState<'surah' | 'juz' | null>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const touch = useRef<{ x: number; y: number; timer?: number; long?: boolean } | null>(null)
  const playingId = player.value?.ayahId
  const boxBottomRef = useRef(false)
  // The translation shows in the inspector beside the text (wide screens), in a box at the bottom (phones), or in a
  // card over the page under its ayah.
  const wide = useWide()
  // "In the page": under each ayah on the text pages, under each line on the printed pages.
  const place: TranslationPlace = s.translationPlace === 'words' && !meta.wbw ? 'panel' : s.translationPlace
  const words = place === 'words'
  // one page at a time: the printed pages, and word by word (too much text to lay out all 604 pages at once)
  const single = printed || words
  const popup = place === 'card'
  const inspector = wide && !popup
  const inlineTr = useMemo(
    () => (place === 'inline' && !printed && data.value ? { info: data.value.ids.map((id) => meta.translations.find((x) => x.id === id)!), texts: data.value.trs, size: Math.round(s.trSize * 0.9) } : undefined),
    [place, data.value, s.trSize],
  )
  const lineTr = useMemo(() => {
    const id = data.value?.ids[0]
    const info = id ? meta.translations.find((x) => x.id === id) : undefined
    return place === 'inline' && printed && info && data.value
      ? { texts: data.value.trs[0]!, dir: info.dir, lang: info.lang, size: Math.round(s.trSize * 0.7) }
      : undefined
  }, [place, printed, data.value, s.trSize])
  const selected = panel?.kind === 'ayah' ? panel.id : undefined
  // One highlight at a time: the ayah being shown, otherwise the one being recited.
  const highlight = selected ?? playingId
  const highlightKind = selected !== undefined ? 'sel' : 'playing'
  const size = Math.round(s.arabicSize * 0.85)

  /** Pages away from the screen are not laid out until needed, so their heights are estimates and the target
   * can shift as the pages around it get laid out. Scroll, then keep it in place for a moment, unless the
   * reader starts scrolling. The height of a laid-out page becomes the estimate for the others. */
  const settling = useRef<() => void>()
  const scrollTo = (find: () => Element | null, block: ScrollLogicalPosition) => {
    settling.current?.()
    let tries = 0
    let timer = 0
    const stop = () => {
      clearTimeout(timer)
      for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const) window.removeEventListener(type, stop)
      settling.current = undefined
    }
    const go = () => {
      const el = find()
      el?.scrollIntoView({ block })
      const page = el?.closest<HTMLElement>('.mpage')
      if (page?.offsetHeight) page.parentElement?.style.setProperty('--page-h', `${page.offsetHeight}px`)
      if (++tries < 8) timer = window.setTimeout(go, 80)
      else stop()
    }
    for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const) window.addEventListener(type, stop, { passive: true })
    settling.current = stop
    go()
  }
  useEffect(() => () => settling.current?.(), [])
  const scrollToPage = (n: number) => scrollTo(() => document.getElementById(`page-${n}`), 'start')

  // Open at the requested page (or the one jumped to before the text arrived), or centred on the requested ayah.
  const wanted = useRef(pageNo)
  useLayoutEffect(() => {
    wanted.current = pageNo
  }, [pageNo])
  useLayoutEffect(() => {
    if (!ready) return
    if (single) {
      // one page at a time: show the page of the requested ayah, or the requested page
      setCurrent(focusId !== undefined ? pageOf(meta, focusId) : wanted.current)
      if (focusId !== undefined) setPanel({ kind: 'ayah', id: focusId })
      window.scrollTo(0, 0)
      setJumping(false)
      return
    }
    if (focusId !== undefined) {
      scrollTo(() => ayahEl(focusId), 'center')
      setPanel({ kind: 'ayah', id: focusId })
    } else {
      scrollToPage(wanted.current)
    }
    setCurrent(wanted.current)
    setJumping(false)
  }, [pageNo, focusId, ready])

  /** Printed pages: turn to a page (a button, "go to page", or the recitation moving on). */
  const turnTo = (n: number, keepPanel = false) => {
    if (n < 1 || n > PAGES || n === current) return
    wanted.current = n
    history.replaceState(history.state, '', href.page(n))
    setCurrent(n)
    if (!keepPanel) setPanel(null)
    window.scrollTo(0, 0)
  }
  // the next and previous pictures are fetched ahead, so turning the page is instant
  useEffect(() => {
    if (!printed) return
    for (const n of [current - 1, current + 1]) if (n >= 1 && n <= PAGES) new Image().src = mushafImage(meta, n)
  }, [printed, current])

  // The page in view drives the header and "where you left off": the page at 30% down the screen.
  useEffect(() => {
    if (!ready || single) return
    let frame = 0
    const look = () => {
      frame = 0
      const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight * 0.3)?.closest<HTMLElement>('.mpage')
      if (el?.dataset.page) setCurrent(Number(el.dataset.page))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(look)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [ready])
  // "Where you left off" is not written while a layer hides the mushaf (and not before it has been looked at).
  useEffect(() => {
    if (paused) return
    const at = locate(meta, pageRange(meta, current).first)
    setLastRead(at.surah, at.ayah)
  }, [current, paused])

  // While reciting: an open ayah panel moves on with the recitation, and (unless turned off in Settings)
  // the ayah being recited is brought into view, even if the reader has scrolled elsewhere.
  useEffect(() => {
    if (playingId === undefined) return
    if (panel?.kind === 'ayah') setPanel({ kind: 'ayah', id: playingId })
    if (single && settings.peek().autoScroll) {
      turnTo(pageOf(meta, playingId), true)
      // a page with translations in it is taller than the screen: keep the ayah being recited in view
      if (lineTr || words) window.setTimeout(() => ayahEl(playingId)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60)
    }
    else if (settings.peek().autoScroll) {
      ayahEl(playingId)?.scrollIntoView({ block: boxBottomRef.current ? 'nearest' : 'center', behavior: 'smooth' })
    }
  }, [playingId])

  // The popup sits under the last line of its ayah (or above its first line, near the bottom of the screen),
  // and moves with it as the page scrolls.
  const popupId = popup ? (selected ?? hoverId) : undefined
  useLayoutEffect(() => {
    if (popupId === undefined) return
    const place = () => {
      const pop = popRef.current
      const lines = ayahRects(popupId)
      if (!pop || !lines.length) return
      const firstLine = lines[0]!
      const lastLine = lines[lines.length - 1]!
      const below = lastLine.bottom + 6
      const bar = document.querySelector<HTMLElement>('.appbar')?.offsetHeight ?? 0
      const room = window.innerHeight - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--player-h')) || 0) // above the player bar
      pop.style.top = `${below + pop.offsetHeight <= room ? below : Math.max(bar + 6, firstLine.top - pop.offsetHeight - 6)}px`
    }
    place()
    window.addEventListener('scroll', place, { passive: true })
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place)
      window.removeEventListener('resize', place)
    }
  })

  const toVerse = () => {
    const at = locate(meta, selected ?? pageRange(meta, current).first)
    location.hash = href.verse(at.surah, at.ayah)
  }

  /** A tap or press on an ayah shows it; anywhere else on the page, the reading options. */
  const pressAt = (target: EventTarget | null, toggle: boolean) => {
    const el = target instanceof Element ? target.closest<HTMLElement>('.ay') : null
    const id = el ? Number(el.dataset.id) : undefined
    if (id) setPanel(toggle && selected === id ? null : { kind: 'ayah', id })
    else setPanel(toggle && panel ? null : { kind: 'options' })
  }

  const ayahPanel = (id: number, variant: 'box' | 'popup') =>
    data.value ? (
      <AyahPanel
        meta={meta}
        id={id}
        ar={data.value.ar[id - 1] as string}
        translations={data.value.ids.map((trId, k) => ({ info: meta.translations.find((x) => x.id === trId)!, text: data.value!.trs[k]![id - 1] as string }))}
        variant={variant}
        showTranslations={place === 'panel' || place === 'card' || place === 'words'}
        panelRef={variant === 'popup' ? popRef : undefined}
        onClose={() => {
          setPanel(null)
          setHoverId(undefined)
        }}
      />
    ) : null

  // The side box: the ayah's panel (unless translations show over the page), or the reading options.
  const box =
    panel?.kind === 'options' ? (
      <PageOptions pageNo={current} juz={juzOf(meta, pageRange(meta, current).first)} onPlay={() => { setPanel(null); playFrom(pageRange(meta, current).first) }} onJump={() => { setPanel(null); setJumping(true) }} onVerseView={toVerse} onClose={() => setPanel(null)} />
    ) : selected !== undefined && !popup ? ayahPanel(selected, 'box') : null
  // On a phone the sheet covers the lower part of the screen. It is not hidden while a layer is open (the layer
  // covers the mushaf), and the ayah is kept clear of it by scroll-margin rather than by padding or jumping.
  const bottomBox = box !== null && !inspector && !paused
  boxBottomRef.current = bottomBox
  useLayoutEffect(() => {
    if (!bottomBox || selected === undefined) return
    const id = selected
    scrollTo(() => ayahEl(id), 'nearest')
  }, [bottomBox, selected])

  const surahOfPage = meta.surahs[locate(meta, pageRange(meta, current).first).surah - 1]!
  // a layout effect, so Escape works as soon as the menu is on screen
  useLayoutEffect(() => {
    if (!menu) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null)
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [menu])
  const juzOfPage = juzOf(meta, pageRange(meta, current).first)
  /** The surah and juz menus, and "go to page", all end here. */
  const goPage = (n: number) => {
    setMenu(null)
    setJumping(false)
    if (!Number.isInteger(n) || n < 1 || n > PAGES) return
    if (single) turnTo(n)
    else {
      wanted.current = n
      history.replaceState(history.state, '', href.page(n))
      scrollToPage(n)
      setCurrent(n)
    }
  }
  const jumpForm = (
    <form
      class="mb-jump"
      onSubmit={(e) => {
        e.preventDefault()
        goPage(Number(new FormData(e.currentTarget).get('page')))
      }}
    >
      {/* The iPhone's number pad has no Go key: a Go button, and leaving the field (Done) goes there too */}
      <input name="page" type="number" min={1} max={PAGES} defaultValue={current} autofocus aria-label={t('goToPage')} inputMode="numeric" enterKeyHint="go"
        onBlur={(e) => {
          const v = Number(e.currentTarget.value)
          if (e.relatedTarget instanceof HTMLElement && e.relatedTarget.closest('.mb-jump')) return // the Go button
          if (Number.isInteger(v) && v >= 1 && v <= PAGES && v !== current) goPage(v)
          else setJumping(false)
        }} />
      <button type="submit" class="mb-go">{t('go')}</button>
    </form>
  )
  const turnButtons = single
  return (
    <>
      <AppBar
        centre={
          // Surah, page and juz in the bar, each a button: the surah and the juz open a menu to pick from, the page
          // opens a field for its number. On the printed pages two small buttons turn to the previous and the next page
          // (the book is right to left: the next page is to the left).
          <div class="mushaf-id" dir="rtl">
            {turnButtons ? (
              <button class="icon-btn small turn-prev" onClick={() => turnTo(current - 1)} disabled={current <= 1} aria-label={t('prevPage')}>
                <Icon name="chevron" size={20} />
              </button>
            ) : null}
            <button class="mb-surah" lang="ar" aria-haspopup="listbox" aria-expanded={menu === 'surah'} aria-label={`${t('surahs')}: ${surahName(surahOfPage)}`} onClick={() => setMenu(menu === 'surah' ? null : 'surah')}>
              <span>{surahOfPage.ar}</span>
            </button>
            {jumping ? (
              jumpForm
            ) : (
              <button class="mb-page" onClick={() => { setMenu(null); setJumping(true) }} aria-label={`${t('goToPage')}: ${t('pageN', { n: current })}`}>
                {num(current)}
              </button>
            )}
            <button class="mb-juz" aria-haspopup="listbox" aria-expanded={menu === 'juz'} onClick={() => setMenu(menu === 'juz' ? null : 'juz')}>
              {t('juzN', { n: juzOfPage })}
            </button>
            {turnButtons ? (
              <button class="icon-btn small turn-next" onClick={() => turnTo(current + 1)} disabled={current >= PAGES} aria-label={t('nextPage')}>
                <Icon name="chevron" size={20} />
              </button>
            ) : null}
          </div>
        }
        end={
          <button class="icon-btn" aria-label={t('pageOptions')} aria-expanded={panel?.kind === 'options'} onClick={() => setPanel(panel?.kind === 'options' ? null : { kind: 'options' })}>
            <Icon name="sliders" size={22} />
          </button>
        }
      />
      {menu ? (
        <>
          <button class="mb-menu-backdrop" aria-label={t('close')} tabIndex={-1} onClick={() => setMenu(null)} />
          <div class="mb-menu" role="listbox" aria-label={menu === 'surah' ? t('surahs') : t('juz')}>
            {menu === 'surah'
              ? meta.surahs.map((x) => (
                  <button key={x.id} role="option" aria-selected={x.id === surahOfPage.id} class={x.id === surahOfPage.id ? 'on' : ''} ref={x.id === surahOfPage.id ? (el) => el?.scrollIntoView({ block: 'center' }) : undefined} onClick={() => goPage(pageOf(meta, x.first))}>
                    <span class="mb-n">{num(x.id)}</span> {surahName(x)} <span class="mb-ar" lang="ar">{x.ar}</span>
                  </button>
                ))
              : meta.juz.map((j) => (
                  <button key={j.n} role="option" aria-selected={j.n === juzOfPage} class={j.n === juzOfPage ? 'on' : ''} ref={j.n === juzOfPage ? (el) => el?.scrollIntoView({ block: 'center' }) : undefined} onClick={() => goPage(pageOf(meta, j.id))}>
                    <span class="mb-n">{num(j.n)}</span> {t('juzN', { n: j.n })} <span class="muted small">{t('pageN', { n: pageOf(meta, j.id) })}</span>
                  </button>
                ))}
          </div>
        </>
      ) : null}
      <div class={`mushaf-layout${inspector ? ' has-inspector' : ''}`}>
        {inspector ? (
          <section class="inspector" aria-label={t('inspectorLabel')} data-testid="inspector">
            {box ?? <p class="inspector-hint muted">{t('inspectorHint')}</p>}
          </section>
        ) : null}
        <div
          class={`mushaf-flow${printed ? ' printed' : ''}`}
          data-page={current}
          data-color={printed ? s.pageColor : undefined}
          onClick={(e) => {
            if (touch.current?.long) return
            if ((e.target as Element).closest('.ayah-popup')) return
            pressAt(e.target, true)
          }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && (e.target as Element).classList.contains('ay')) {
              e.preventDefault()
              pressAt(e.target, true)
            }
          }}
          // Over the ayah: a mouse shows it on hover.
          onMouseOver={(e) => {
            if (!popup || selected !== undefined || !matchMedia('(hover: hover)').matches) return
            const target = e.target as Element
            if (target.closest('.ayah-popup')) return
            const el = target.closest<HTMLElement>('.ay')
            setHoverId(el ? Number(el.dataset.id) : undefined)
          }}
          onMouseLeave={() => setHoverId(undefined)}
          // A long press (or right click) opens Zekr's own panel instead of the browser's menu.
          onContextMenu={(e) => {
            e.preventDefault()
            pressAt(e.target, false)
          }}
          onTouchStart={(e) => {
            const p = e.touches[0]
            if (!p) return
            const target = e.target
            touch.current = {
              x: p.clientX,
              y: p.clientY,
              timer: window.setTimeout(() => {
                if (touch.current) touch.current.long = true
                pressAt(target, false)
              }, 500),
            }
          }}
          onTouchMove={(e) => {
            const start = touch.current
            const p = e.touches[0]
            if (start && p && Math.hypot(p.clientX - start.x, p.clientY - start.y) > 10) clearTimeout(start.timer)
          }}
          onTouchEnd={() => {
            const start = touch.current
            if (start) clearTimeout(start.timer)
            // keep the record a moment so the click that follows a long press is ignored
            window.setTimeout(() => { if (touch.current === start) touch.current = null }, 0)
          }}
        >
          {data.error || map.error ? <LoadError retry={data.error ? data.retry : map.retry} /> : !ready ? <Loading /> : (
            (single ? [current - 1] : Array.from({ length: PAGES }, (_, i) => i)).map((i) => {
              const n = i + 1
              const { first, last } = pageRange(meta, n)
              const on = highlight !== undefined && highlight >= first && highlight <= last
              const pg = map.value?.[i]
              if (words) {
                return <WordsPage key={n} meta={meta} n={n} basmala={meta.basmala.uthmani} size={size} trSize={Math.round(s.trSize * 0.75)}
                  highlight={on ? highlight : undefined} kind={on ? highlightKind : undefined} />
              }
              if (pg && lineTr) {
                return <InterlinearPage key={n} meta={meta} pg={pg} ar={data.value!.ar} highlight={on ? highlight : undefined} kind={on ? highlightKind : undefined} tr={lineTr} onJump={() => setJumping(true)} />
              }
              if (pg) {
                return <PrintedPage key={n} meta={meta} pg={pg} ar={data.value!.ar} highlight={on ? highlight : undefined} kind={on ? highlightKind : undefined} onJump={() => setJumping(true)} />
              }
              return (
                <MushafPage key={n} meta={meta} n={n} ar={data.value!.ar} basmala={meta.basmala[s.script]} size={size}
                  highlight={on ? highlight : undefined} kind={on ? highlightKind : undefined} inline={inlineTr} />
              )
            })
          )}
          {popupId !== undefined ? ayahPanel(popupId, 'popup') : null}
        </div>
        {bottomBox ? <Sheet onClose={() => setPanel(null)}>{box}</Sheet> : null}
      </div>
    </>
  )
}
