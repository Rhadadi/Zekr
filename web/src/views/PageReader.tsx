import { useEffect, useRef, useState } from 'preact/hooks'
import { player, playFrom } from '../audio'
import { AyahSheet } from '../components/AyahSheet'
import { Icon } from '../components/Icon'
import { PageOptions } from '../components/PageOptions'
import { LoadError, Loading } from '../components/Page'
import { type Meta, juzOf, loadText, loadTranslation, locate, pageOf, pageRange } from '../data'
import { useAsync } from '../hooks'
import { num, t } from '../i18n'
import { href } from '../router'
import { setLastRead, settings, updateSettings } from '../store'

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩'
/** Ayah numbers inside the text use the traditional Arabic-Indic digits, as printed mushafs do. */
const marker = (n: number) => String(n).replace(/\d/g, (d) => ARABIC_INDIC[Number(d)] as string)

export function PageReader({ meta, pageNo, focusId }: { meta: Meta; pageNo: number; focusId?: number }) {
  const s = settings.value
  const { first, last } = pageRange(meta, pageNo)
  const trKey = s.translations.join(',')
  const data = useAsync(async () => {
    const ids = s.translations.filter((id) => meta.translations.some((x) => x.id === id))
    const [ar, ...trs] = await Promise.all([loadText(s.script), ...ids.map((id) => loadTranslation(id))])
    return { ar, trs, ids }
  }, [s.script, trKey])

  const [selected, setSelected] = useState<number | undefined>(focusId)
  const [options, setOptions] = useState(false)
  const [jumping, setJumping] = useState(false)
  const touch = useRef<{ x: number; y: number; timer?: number; long?: boolean } | null>(null)
  const playingId = player.value?.ayahId
  // Whether the ayah panel is open, as of the last render (read inside effects).
  const panelOpen = useRef(false)
  panelOpen.current = selected !== undefined

  const goTo = (p: number) => {
    if (p >= 1 && p <= 604) location.hash = href.page(p)
  }

  // New page: start at the top, with the requested ayah selected. If the panel was open during a
  // recitation that turned the page, it stays open on the ayah being recited.
  useEffect(() => {
    const follow = panelOpen.current && playingId !== undefined && pageOf(meta, playingId) === pageNo
    setSelected(focusId ?? (follow ? playingId : undefined))
    setOptions(false)
    setJumping(false)
    const firstSurah = locate(meta, first)
    setLastRead(firstSurah.surah, firstSurah.ayah)
    if (focusId === undefined) window.scrollTo(0, 0)
  }, [pageNo, focusId])

  // Bring the selected ayah into view, above the translation panel.
  useEffect(() => {
    if (selected === undefined || !data.value) return
    document.querySelector(`.ay[data-id="${selected}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [selected, !!data.value])

  // While reciting, turn the page when the recitation moves on, but only if the reader was following along.
  // An open ayah panel moves on with the recitation, so it always shows the ayah being heard.
  const followed = useRef<number | undefined>(undefined)
  useEffect(() => {
    const prev = followed.current
    followed.current = playingId
    if (playingId !== undefined && panelOpen.current) setSelected(playingId)
    if (playingId === undefined || prev === undefined) return
    if (pageOf(meta, prev) === pageNo && pageOf(meta, playingId) !== pageNo) location.replace(href.page(pageOf(meta, playingId)))
  }, [playingId])

  /** Long press: on an ayah, its panel; elsewhere, the reading options. */
  const pressAt = (target: EventTarget | null) => {
    const el = target instanceof Element ? target.closest<HTMLElement>('.ay') : null
    const id = el ? Number(el.dataset.id) : undefined
    if (id) {
      setOptions(false)
      setSelected(id)
    } else {
      setSelected(undefined)
      setOptions(true)
    }
  }

  const surahOfPage = meta.surahs[locate(meta, first).surah - 1]!
  const toVerse = () => {
    const at = locate(meta, selected ?? first)
    updateSettings({ readMode: 'verse' })
    location.hash = href.verse(at.surah, at.ayah)
  }

  const flow: preact.ComponentChildren[] = []
  let run: preact.ComponentChildren[] = []
  const flush = () => {
    if (run.length) flow.push(<p class="flow" lang="ar" dir="rtl" key={`f${flow.length}`} style={{ fontSize: `${Math.round(s.arabicSize * 0.85)}px` }}>{run}</p>)
    run = []
  }
  if (data.value) {
    for (let id = first; id <= last; id++) {
      const at = locate(meta, id)
      if (at.ayah === 1) {
        flush()
        const surah = meta.surahs[at.surah - 1]!
        flow.push(
          <div class="banner" key={`b${at.surah}`} role="heading" aria-level={2} lang="ar" dir="rtl">
            <span class="banner-name">سورة {surah.ar}</span>
          </div>,
        )
        if (at.surah !== 1 && at.surah !== 9) {
          flow.push(<p class="basmala" lang="ar" dir="rtl" key={`s${at.surah}`} style={{ fontSize: `${Math.round(s.arabicSize * 0.85)}px` }}>{meta.basmala[s.script]}</p>)
        }
      }
      run.push(
        <span
          key={id}
          class={`ay${selected === id ? ' sel' : ''}${selected === undefined && playingId === id ? ' playing' : ''}`}
          data-id={id}
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            if (touch.current?.long) return
            setOptions(false)
            setSelected(selected === id ? undefined : id)
          }}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelected(selected === id ? undefined : id))}
        >
          {data.value.ar[id - 1]} <span class="mark">﴿{marker(at.ayah)}﴾</span>
        </span>,
        ' ',
      )
    }
    flush()
  }

  const selectedTranslations =
    selected !== undefined && data.value
      ? data.value.ids.map((trId, k) => ({
          info: meta.translations.find((x) => x.id === trId)!,
          text: data.value!.trs[k]![selected - 1] as string,
        }))
      : []

  return (
    <>
      <header class="mushaf-bar" dir="rtl">
        <span class="mb-surah" lang="ar">سورة {surahOfPage.ar}</span>
        {jumping ? (
          <form
            class="mb-jump"
            onSubmit={(e) => {
              e.preventDefault()
              const v = Number(new FormData(e.currentTarget).get('page'))
              if (Number.isInteger(v)) goTo(v)
              setJumping(false)
            }}
          >
            <input name="page" type="number" min={1} max={604} defaultValue={pageNo} autofocus aria-label={t('goToPage')} inputMode="numeric" />
          </form>
        ) : (
          <button class="mb-page" onClick={() => setJumping(true)} aria-label={`${t('goToPage')}: ${t('pageN', { n: pageNo })}`}>
            {num(pageNo)}
          </button>
        )}
        <span class="mb-juz">{t('juzN', { n: juzOf(meta, first) })}</span>
      </header>
      <div class="page-wrap">
      <div
        class="mushaf-page"
        data-page={pageNo}
        // Tap the page (not an ayah) for reading options; tap again to close what is open.
        onClick={() => {
          if (touch.current?.long) return
          if (selected !== undefined) setSelected(undefined)
          else setOptions(!options)
        }}
        // A long press (or right click) opens Zekr's own options instead of the browser's menu.
        onContextMenu={(e) => {
          e.preventDefault()
          pressAt(e.target)
        }}
        onTouchStart={(e) => {
          const p = e.touches[0]
          if (!p) return
          const target = e.target
          touch.current = { x: p.clientX, y: p.clientY, timer: window.setTimeout(() => {
            if (touch.current) touch.current.long = true
            pressAt(target)
          }, 500) }
        }}
        onTouchMove={(e) => {
          const start = touch.current
          const p = e.touches[0]
          if (start && p && Math.hypot(p.clientX - start.x, p.clientY - start.y) > 10) clearTimeout(start.timer)
        }}
        onTouchEnd={(e) => {
          const start = touch.current
          const end = e.changedTouches[0]
          if (start) clearTimeout(start.timer)
          // keep the record a moment so the click that follows a long press is ignored
          window.setTimeout(() => { if (touch.current === start) touch.current = null }, 0)
          if (!start || !end || start.long) return
          const dx = end.clientX - start.x
          if (Math.abs(dx) > 70 && Math.abs(end.clientY - start.y) < 45) goTo(pageNo + (dx > 0 ? 1 : -1)) // right-to-left book: swipe right = next page
        }}
      >
        {data.error ? <LoadError retry={data.retry} /> : !data.value ? <Loading /> : flow}
      </div>
      <nav class="pager" aria-label={t('readPage')}>
        <button class="icon-btn pager-btn" disabled={pageNo >= 604} onClick={() => goTo(pageNo + 1)} aria-label={t('nextPage')}>
          <span class="chev-next"><Icon name="chevron" size={18} /></span>
        </button>
        <span class="muted small">{t('pageN', { n: pageNo })} / {num(604)}</span>
        <button class="icon-btn pager-btn" disabled={pageNo <= 1} onClick={() => goTo(pageNo - 1)} aria-label={t('prevPage')}>
          <span class="chev-prev"><Icon name="chevron" size={18} /></span>
        </button>
      </nav>
      </div>
      {options && data.value ? (
        <PageOptions pageNo={pageNo} juz={juzOf(meta, first)} onPlay={() => { setOptions(false); playFrom(first) }} onVerseView={toVerse} onClose={() => setOptions(false)} />
      ) : selected !== undefined && data.value ? (
        <AyahSheet meta={meta} id={selected} ar={data.value.ar[selected - 1] as string} translations={selectedTranslations}
          playing={playingId === selected && (player.value?.status === 'playing' || player.value?.status === 'loading')}
          onClose={() => setSelected(undefined)} />
      ) : (
        !jumping && data.value && <p class="muted small tip pager-tip">{t('tapAyah')}</p>
      )}
    </>
  )
}
