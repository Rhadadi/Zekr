import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { playFrom, playSurah, player } from '../audio'
import { Icon } from '../components/Icon'
import brandMark from '../assets/ayesheno-logo.png'
import brandWaves from '../assets/ayesheno-waves.png'
import { LoadError, Loading } from '../components/Page'
import { StudyVerse, type StudyTab } from '../components/StudyVerse'
import { StudyIntroLink } from '../components/StudyQuranPanel'
import { TranslationAudioToggle } from '../components/TranslationAudioToggle'
import { type Meta, loadText, loadTranslation } from '../data'
import { useAsync } from '../hooks'
import { lang, num, surahName, t } from '../i18n'
import { closeLayer, href } from '../router'
import { isBookmarked, setLastRead, settings, toggleBookmark } from '../store'
import { drawerOpen, openDrawer, gotoOpen } from '../ui'

/** A continuous edition; listening follows ayahs without changing the text's geometry. */
export function StudyView({ meta, surahId, ayah }: { meta: Meta; surahId: number; ayah?: number }) {
  const s = settings.value
  const surah = meta.surahs[surahId - 1]!
  const [current, setCurrent] = useState(ayah ?? 1)
  const [panels, setPanels] = useState<Record<number, StudyTab>>({})
  const [following, setFollowing] = useState(true)
  const [options, setOptions] = useState(false)
  const [companionOpen, setCompanionOpen] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const reader = useRef<HTMLDivElement>(null)
  const anchor = useRef<HTMLElement | null>(null)
  const companionTarget = useRef(false)
  const layoutEpoch = useRef(0)
  const positioning = useRef(false)
  const browsing = useRef(false)
  const previousRoute = useRef('')
  const tab = panels[current] ?? 'translation'
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
  useEffect(() => setPanels({}), [surahId])
  useLayoutEffect(() => {
    const key = `${surahId}:${ayah ?? 1}`
    const changed = previousRoute.current !== key
    const n = changed ? Math.max(1, Math.min(ayah ?? 1, surah.ayahs)) : current
    previousRoute.current = key
    if (changed) {
      anchor.current = null
      setCurrent(n)
      setLastRead(surahId, n)
    }
    if (data.value) moveTo(anchor.current && companionTarget.current ? `companion-${n}` : `a-${n}`)
  }, [data.value, surahId, ayah, s.arabicSize, s.trSize, s.quranFont, s.theme, lang.value, drawerOpen.value])
  useEffect(() => {
    const layer = reader.current?.closest<HTMLElement>('.layer')
    if (!layer) return
    const suspend = () => { browsing.current = true; layoutEpoch.current++; positioning.current = false; anchor.current = null; setCompanionOpen(false); setFollowing(false) }
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
        // Companion navigation intentionally holds its ayah while its full text is read.
        // Font reflow, focus and opening a drawer can scroll too; only browsing changes the selected ayah.
        if (!browsing.current || anchor.current || positioning.current || drawerOpen.peek()) return
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
    if (playing === undefined || !following || !s.autoScroll) return
    anchor.current = null
    setCurrent(playing)
    move(playing)
  }, [playing, following, s.autoScroll])
  useEffect(() => {
    const resize = () => {
      const target = anchor.current && companionTarget.current ? `companion-${current}` : `a-${current}`
      moveTo(target)
    }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [current])
  const changeFocus = () => {
    setFocusMode(!focusMode)
    setCompanionOpen(false)
    anchor.current = document.getElementById(`a-${current}`)
    move(current)
    requestAnimationFrame(() => { anchor.current = null })
  }
  useEffect(() => {
    const layer = reader.current?.closest<HTMLElement>('.layer')
    const shortcut = (e: KeyboardEvent) => {
      if (e.repeat || e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"]'))) return
      e.preventDefault()
      changeFocus()
    }
    layer?.addEventListener('keydown', shortcut)
    return () => layer?.removeEventListener('keydown', shortcut)
  }, [focusMode, current])
  const navigate = (n: number) => {
    anchor.current = null
    setCompanionOpen(false)
    setFollowing(false)
    setCurrent(n)
    setLastRead(surahId, n)
    move(n)
  }
  const choose = (value: StudyTab) => {
    setFollowing(false)
    anchor.current = document.getElementById(`a-${current}`)
    // A short passage and its explanation can stay together; long ayahs need a return point.
    const arabic = anchor.current?.querySelector('.study-ar')
    companionTarget.current = (arabic?.getBoundingClientRect().height ?? 0) > window.innerHeight * .42
    setCompanionOpen(companionTarget.current)
    setPanels(previous => ({ ...previous, [current]: value }))
    moveTo(companionTarget.current ? `companion-${current}` : `a-${current}`)
  }
  const resume = () => { anchor.current = null; setCompanionOpen(false); setFollowing(true); if (playing !== undefined) { setCurrent(playing); move(playing) } }
  const returnArabic = () => { anchor.current = null; setCompanionOpen(false); move(current) }
  const followRecitation = () => { anchor.current = null; setCompanionOpen(false); setFollowing(true) }
  const tabs: [StudyTab, string][] = [['translation', t('ayahTranslation')], ['tafsir', t('tafsir')], ['words', t('words')]]
  return <div class="study-reader" ref={reader} data-focus={focusMode} style={{ '--study-ar-size': `${s.arabicSize}px`, '--study-tr-size': `${s.trSize}px`, '--study-progress': current / surah.ayahs }}>
    <header class="study-toolbar">
      <div class="study-toolbar-start">
        <button class="study-menu" aria-label={t('menu')} aria-haspopup="dialog" aria-expanded={drawerOpen.value} onClick={e => openDrawer(e.currentTarget)}><Icon name="list" /></button>
        <button class="study-settings" aria-label={t('settings')} aria-haspopup="dialog" aria-expanded={drawerOpen.value} onClick={e => openDrawer(e.currentTarget, 'settings')}><Icon name="settings" size={19} /><span>{t('settings')}</span></button>
        <button class="study-focus" aria-label={focusMode ? t('studyExitFocus') : t('studyFocus')} title={`${focusMode ? t('studyExitFocus') : t('studyFocus')} · F`} aria-keyshortcuts="F" aria-pressed={focusMode} onClick={changeFocus}><Icon name="focus" size={19} /><span>{t('studyFocusLabel')}</span></button>
      </div>
      <div class="study-location">
        <button class="study-prev" aria-label={t('previous')} disabled={current <= 1} onClick={() => navigate(current - 1)}><Icon name="chevron" size={17} /></button>
        <button class="study-location-pick" onClick={() => { gotoOpen.value = true }} aria-label={t('goTo')}><h1>{surahName(surah)}<span class="study-location-ayah">{num(current)} <small>/ {num(surah.ayahs)}</small></span></h1><span class="study-position-track" aria-hidden="true"><span /></span></button>
        <button aria-label={t('next')} disabled={current >= surah.ayahs} onClick={() => navigate(current + 1)}><Icon name="chevron" size={17} /></button>
      </div>
      <nav class="study-modes" aria-label={t('readerMode')} dir={lang.value === 'fa' ? 'rtl' : 'ltr'}><a href={href.ayah(surahId, current)}>{t('navReading')}</a><span aria-current="page">{t('navStudy')}</span></nav>
      <div class="study-toolbar-end"><button class="study-brand" aria-label={`${t('appName')} · ${t('navIndex')}`} onClick={closeLayer}><span class="study-brand-symbol"><img class="study-brand-mark" src={brandMark} alt={t('appName')} /><img class="study-brand-waves" src={brandWaves} alt="" /></span><span class="study-brand-caption" lang="en" dir="ltr">AYESHENO</span></button><button class="layer-close" aria-label={t('close')} onClick={closeLayer}><Icon name="close" size={19} /></button></div>
    </header>
    <div class="study-content">
      {data.error ? <LoadError retry={data.retry} /> : !data.value ? <Loading /> : <div class="ayahs">
        {surahId !== 1 && surahId !== 9 ? <p class="basmala" lang="ar" dir="rtl">{meta.basmala[s.script]}</p> : null}
        {Array.from({ length: surah.ayahs }, (_, i) => {
          const id = surah.first + i
          return <StudyVerse key={id} meta={meta} surah={surahId} n={i + 1} ar={data.value!.ar[id - 1]!}
            translations={data.value!.ids.map((idTr, k) => ({ info: meta.translations.find(x => x.id === idTr)!, text: data.value!.trs[k]![id - 1]! }))}
            active={current === i + 1} tab={panels[i + 1] ?? 'translation'} playing={playing === i + 1} paused={p?.status === 'paused' || p?.status === 'error'} focused={current === i + 1}
            onPlay={followRecitation}
            onSelect={() => { if (current !== i + 1) { layoutEpoch.current++; positioning.current = false; anchor.current = null; setCompanionOpen(false); setFollowing(false); setCurrent(i + 1); setLastRead(surahId, i + 1) } }} />
        })}
      </div>}
      <nav class="study-surah-nav" aria-label={t('surahs')}>
        {surahId > 1 ? <a href={href.verse(surahId - 1)}>{num(surahId - 1)}. {surahName(meta.surahs[surahId - 2]!)}</a> : <span />}
        {surahId < 114 ? <a href={href.verse(surahId + 1)}>{num(surahId + 1)}. {surahName(meta.surahs[surahId]!)}</a> : null}
      </nav>
    </div>
    <div class="study-tools-shell" onKeyDown={e => {
      if (e.key === 'Escape' && options) { e.stopPropagation(); setOptions(false); reader.current?.querySelector<HTMLButtonElement>('.study-edition-toggle')?.focus() }
    }}>
      <div class="study-rail-heading"><span>{surahName(surah)}</span><span class="study-rail-position">{num(surahId)}:{num(current)}</span></div>
      {playing !== undefined && !following ? <button class="study-follow" onClick={resume}>{t('studyFollow')}</button> : companionOpen ? <button class="study-follow" onClick={returnArabic}>{t('studyReturnArabic')}</button> : null}
      <div class="study-tabs study-tools" role="tablist" aria-label={t('reading')}>
        {tabs.map(([value, label], i) => <button key={value} id={`study-tab-${value}`} role="tab" aria-selected={tab === value} aria-controls={`companion-${current}`} tabIndex={tab === value ? 0 : -1} onClick={() => choose(value)} onKeyDown={e => {
          let next = i
          if (e.key === 'Home') next = 0
          else if (e.key === 'End') next = 2
          else if (e.key === 'ArrowDown') next = (i + 1) % 3
          else if (e.key === 'ArrowUp') next = (i + 2) % 3
          else if (e.key === 'ArrowRight') next = (i + (lang.value === 'fa' ? 2 : 1)) % 3
          else if (e.key === 'ArrowLeft') next = (i + (lang.value === 'fa' ? 1 : 2)) % 3
          else return
          e.preventDefault(); choose(tabs[next]![0]); document.getElementById(`study-tab-${tabs[next]![0]}`)?.focus()
        }}>{label}</button>)}
      </div>
      <div class="study-passage-actions">
      {playing !== current ? <button class="study-listen" aria-label={t('playFromHere')} onClick={e => {
        followRecitation()
        move(current)
        playFrom(surah.first + current - 1)
        if (e.detail === 0) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.player-controls .big')?.focus({ preventScroll: true }))
      }}><span><Icon name="play" size={17} /></span><small>{t('studyListen')}</small></button> : null}
      <button class="study-save" aria-label={isBookmarked(surah.first + current - 1) ? t('unbookmark') : t('bookmark')} title={isBookmarked(surah.first + current - 1) ? t('unbookmark') : t('bookmark')} aria-pressed={isBookmarked(surah.first + current - 1)} onClick={() => toggleBookmark(surah.first + current - 1)}><Icon name="bookmark" size={18} /></button>
      <button class="study-edition-toggle" aria-label={t('more')} title={t('more')} aria-expanded={options} aria-controls="study-edition" onClick={() => setOptions(!options)}><Icon name="more" size={18} /></button>
      </div>
      {options ? <div class="study-edition" id="study-edition"><StudyIntroLink meta={meta} surah={surahId} /><button onClick={() => { followRecitation(); playSurah(surahId) }}><Icon name="play" size={16} />{t('playSurah')}</button><TranslationAudioToggle /></div> : null}
    </div>
  </div>
}
