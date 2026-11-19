import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { playSurah, player } from '../audio'
import { Icon } from '../components/Icon'
import brandMark from '../assets/ayesheno-logo.png'
import brandWaves from '../assets/ayesheno-waves.png'
import { LoadError, Loading } from '../components/Page'
import { StudyNavigation } from '../components/StudyNavigation'
import { StudyVerse } from '../components/StudyVerse'
import { StudyIntroLink } from '../components/StudyQuranPanel'
import { TranslationAudioToggle } from '../components/TranslationAudioToggle'
import { type Meta, loadText, loadTranslation } from '../data'
import { useAsync } from '../hooks'
import { lang, num, surahName, t } from '../i18n'
import { closeLayer, href } from '../router'
import { setLastRead, settings } from '../store'
import { drawerOpen, openDrawer } from '../ui'

/** A continuous edition; listening follows ayahs without changing the text's geometry. */
export function StudyView({ meta, surahId, ayah }: { meta: Meta; surahId: number; ayah?: number }) {
  const s = settings.value
  const surah = meta.surahs[surahId - 1]!
  const [current, setCurrent] = useState(ayah ?? 1)
  const [following, setFollowing] = useState(true)
  const [options, setOptions] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [zenControls, setZenControls] = useState(false)
  const reader = useRef<HTMLDivElement>(null)
  const layoutEpoch = useRef(0)
  const positioning = useRef(false)
  const browsing = useRef(false)
  const previousRoute = useRef('')
  const p = player.value
  const playing = p && !p.commentary && p.ayahId >= surah.first && p.ayahId < surah.first + surah.ayahs ? p.ayahId - surah.first + 1 : undefined
  const data = useAsync(async () => {
    const ids = s.translations.filter(id => meta.translations.some(x => x.id === id))
    const [ar, ...trs] = await Promise.all([loadText(s.script), ...ids.map(id => loadTranslation(id))])
    return { ar, trs, ids }
  }, [s.script, s.translations.join(',')])
  const moveTo = (id: string) => {
    const epoch = ++layoutEpoch.current
    browsing.current = false
    positioning.current = true
    const restore = () => {
      const target = document.getElementById(id)
      if (layoutEpoch.current === epoch && target && reader.current?.contains(target)) target.scrollIntoView({ block: 'start', behavior: 'auto' })
    }
    requestAnimationFrame(() => {
      restore()
      // Font changes can reflow the whole surah after its first paint.
      void document.fonts.ready.then(() => {
        restore()
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (layoutEpoch.current === epoch) positioning.current = false
        }))
      })
    })
  }
  const move = (n: number) => moveTo(`a-${n}`)
  useLayoutEffect(() => {
    const key = `${surahId}:${ayah ?? 1}`
    const changed = previousRoute.current !== key
    const n = changed ? Math.max(1, Math.min(ayah ?? 1, surah.ayahs)) : current
    previousRoute.current = key
    if (changed) {
      setCurrent(n)
      setLastRead(surahId, n)
    }
    if (data.value) move(n)
  }, [data.value, surahId, ayah, s.arabicSize, s.trSize, s.quranFont, s.theme, lang.value, drawerOpen.value])
  useEffect(() => {
    const layer = reader.current?.closest<HTMLElement>('.layer')
    if (!layer) return
    const suspend = (e?: Event) => { if (e?.target instanceof Element && e.target.closest('dialog[open]')) return; browsing.current = true; layoutEpoch.current++; positioning.current = false; setFollowing(false) }
    const pointer = (e: PointerEvent) => { if (e.target === layer) suspend() }
    const key = (e: KeyboardEvent) => { if (['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End', ' '].includes(e.key) && !(e.target instanceof Element && e.target.closest('button,input,[role="tab"]'))) suspend() }
    layer.addEventListener('wheel', suspend, { passive: true })
    layer.addEventListener('touchmove', suspend, { passive: true })
    layer.addEventListener('keydown', key)
    layer.addEventListener('pointerdown', pointer)
    let frame = 0
    const observe = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        // Font reflow, focus and opening a drawer can scroll too; only browsing changes the selected ayah.
        if (!browsing.current || positioning.current || drawerOpen.peek()) return
        const articles = reader.current?.querySelectorAll<HTMLElement>('article.ayah')
        let n = ayah ?? 1
        for (const el of articles ?? []) {
          if (!el.getClientRects().length) continue
          if (el.getBoundingClientRect().top <= 180) n = Number(el.dataset.ayah)
          else break
        }
        setCurrent(n)
        setLastRead(surahId, n)
      })
    }
    layer.addEventListener('scroll', observe, { passive: true })
    return () => { cancelAnimationFrame(frame); layer.removeEventListener('wheel', suspend); layer.removeEventListener('touchmove', suspend); layer.removeEventListener('keydown', key); layer.removeEventListener('pointerdown', pointer); layer.removeEventListener('scroll', observe) }
  }, [surahId, ayah])
  useEffect(() => {
    const content = reader.current?.querySelector<HTMLElement>('.study-content')
    if (!content) return
    // Saved commentary above this ayah can arrive after the Quran text and change its position.
    const observer = new ResizeObserver(() => {
      if (browsing.current || drawerOpen.peek() || reader.current?.querySelector('dialog[open]')) return
      const target = document.getElementById(`a-${current}`)
      const layer = reader.current?.closest('.study-layer')
      if (!target || !layer) return
      const top = parseFloat(getComputedStyle(layer).scrollPaddingTop)
      if (Math.abs(target.getBoundingClientRect().top - top) > 2) move(current)
    })
    observer.observe(content)
    return () => observer.disconnect()
  }, [current, data.value])
  useEffect(() => {
    if (playing === undefined || !following || !s.autoScroll) return
    setCurrent(playing)
    move(playing)
  }, [playing, following, s.autoScroll])
  useEffect(() => {
    const resize = () => {
      move(current)
    }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [current])
  const changeFocus = () => {
    setFocusMode(!focusMode)
    setZenControls(false)
    requestAnimationFrame(() => reader.current?.focus({ preventScroll: true }))
    move(current)
  }
  useEffect(() => {
    const layer = reader.current?.closest<HTMLElement>('.layer')
    const shortcut = (e: KeyboardEvent) => {
      if (focusMode && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); changeFocus(); return }
      if (focusMode && ['ArrowLeft', 'ArrowRight'].includes(e.key) && !(e.target instanceof Element && e.target.closest('input,textarea,select,dialog'))) { e.preventDefault(); navigate(Math.max(1, Math.min(surah.ayahs, current + (e.key === 'ArrowLeft' ? 1 : -1)))); return }
      if (e.repeat || e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof Element && e.target.closest('input,textarea,select,dialog,[contenteditable="true"]'))) return
      e.preventDefault()
      changeFocus()
    }
    layer?.addEventListener('keydown', shortcut)
    return () => layer?.removeEventListener('keydown', shortcut)
  }, [focusMode, current])
  const navigate = (n: number) => {
    setFollowing(false)
    setCurrent(n)
    setLastRead(surahId, n)
    move(n)
  }
  const resume = () => { setFollowing(true); if (playing !== undefined) { setCurrent(playing); move(playing) } }
  const followRecitation = () => { setFollowing(true) }
  return <div class="study-reader" ref={reader} tabIndex={-1} data-focus={focusMode} data-zen-controls={zenControls} onClick={e => { if (focusMode && !(e.target instanceof Element && e.target.closest('button,a'))) setZenControls(!zenControls) }} data-following={following && playing !== undefined} style={{ '--study-ar-size': `${s.arabicSize}px`, '--study-tr-size': `${s.trSize}px`, '--study-progress': current / surah.ayahs }}>
    <header class="study-toolbar">
      <div class="study-toolbar-start">
        <button class="study-menu" aria-label={t('menu')} aria-haspopup="dialog" aria-expanded={drawerOpen.value} onClick={e => openDrawer(e.currentTarget)}><Icon name="list" /></button>
        <button class="study-settings" aria-label={t('settings')} aria-haspopup="dialog" aria-expanded={drawerOpen.value} onClick={e => openDrawer(e.currentTarget, 'settings')}><Icon name="settings" size={19} /><span>{t('settings')}</span></button>
        <button class="study-focus" aria-label={focusMode ? t('studyExitFocus') : t('studyFocus')} title={`${focusMode ? t('studyExitFocus') : t('studyFocus')} · F`} aria-keyshortcuts="F" aria-pressed={focusMode} onClick={changeFocus}><Icon name="focus" size={19} /><span>{t('studyFocusLabel')}</span></button>
        <div class="study-edition-menu" onKeyDown={e => { if (e.key === 'Escape' && options) { e.stopPropagation(); setOptions(false); reader.current?.querySelector<HTMLButtonElement>('.study-edition-toggle')?.focus() } }}>
          <button class="study-edition-toggle" aria-label={t('more')} aria-expanded={options} onClick={() => setOptions(!options)}><Icon name="more" size={18} /></button>
          {options ? <div class="study-edition"><StudyIntroLink meta={meta} surah={surahId} /><button onClick={() => { followRecitation(); playSurah(surahId) }}><Icon name="play" size={16} />{t('playSurah')}</button><TranslationAudioToggle /></div> : null}
        </div>
      </div>
      <StudyNavigation meta={meta} surahId={surahId} current={current} navigate={navigate} />
      <nav class="study-modes" aria-label={t('readerMode')} dir={lang.value === 'fa' ? 'rtl' : 'ltr'}><a href={href.ayah(surahId, current)}>{t('navReading')}</a><span aria-current="page">{t('navStudy')}</span></nav>
      <div class="study-toolbar-end"><button class="study-brand" aria-label={`${t('appName')} · ${t('navIndex')}`} onClick={closeLayer}><span class="study-brand-symbol"><img class="study-brand-mark" src={brandMark} alt={t('appName')} /><img class="study-brand-waves" src={brandWaves} alt="" /></span><span class="study-brand-caption" lang="en" dir="ltr">AYESHENO</span></button><button class="layer-close" aria-label={t('close')} onClick={closeLayer}><Icon name="close" size={19} /></button></div>
    </header>
    {focusMode ? <nav class="study-zen-controls" aria-label={t('navStudy')}><button aria-label={t('previous')} disabled={current <= 1} onClick={() => navigate(current - 1)}><Icon name="chevron" size={18} /></button><button onClick={changeFocus}>{t('studyExitFocus')}</button><button aria-label={t('next')} disabled={current >= surah.ayahs} onClick={() => navigate(current + 1)}><Icon name="chevron" size={18} /></button></nav> : null}
    <div class="study-content">
      {data.error ? <LoadError retry={data.retry} /> : !data.value ? <Loading /> : <div class="ayahs">
        {surahId !== 1 && surahId !== 9 ? <p class="basmala" lang="ar" dir="rtl">{meta.basmala[s.script]}</p> : null}
        {Array.from({ length: surah.ayahs }, (_, i) => {
          const id = surah.first + i
          return <StudyVerse key={id} meta={meta} surah={surahId} n={i + 1} ar={data.value!.ar[id - 1]!}
            translations={data.value!.ids.map((idTr, k) => ({ info: meta.translations.find(x => x.id === idTr)!, text: data.value!.trs[k]![id - 1]! }))}
            active={current === i + 1} playing={playing === i + 1} paused={p?.status === 'paused' || p?.status === 'error'} focused={current === i + 1}
            onPlay={followRecitation}
            onSelect={() => { layoutEpoch.current++; positioning.current = false; setFollowing(false); setCurrent(i + 1); setLastRead(surahId, i + 1) }} />
        })}
      </div>}
      <nav class="study-surah-nav" aria-label={t('surahs')}>
        {surahId > 1 ? <a href={href.verse(surahId - 1)}>{num(surahId - 1)}. {surahName(meta.surahs[surahId - 2]!)}</a> : <span />}
        {surahId < 114 ? <a href={href.verse(surahId + 1)}>{num(surahId + 1)}. {surahName(meta.surahs[surahId]!)}</a> : null}
      </nav>
    </div>
    {playing !== undefined && !following ? <button class="study-follow" onClick={resume}>{t('studyFollow')}</button> : null}
  </div>
}
