import { useEffect, useRef, useState } from 'preact/hooks'
import { playFrom, playSurah, player } from '../audio'
import { Icon } from '../components/Icon'
import { Logo } from '../components/AppBar'
import { LoadError, Loading } from '../components/Page'
import { StudyVerse, type StudyTab } from '../components/StudyVerse'
import { StudyIntroLink } from '../components/StudyQuranPanel'
import { TranslationAudioToggle } from '../components/TranslationAudioToggle'
import { type Meta, loadText, loadTranslation } from '../data'
import { useAsync } from '../hooks'
import { lang, num, surahName, t } from '../i18n'
import { closeLayer, href } from '../router'
import { setLastRead, settings } from '../store'
import { drawerOpen, gotoOpen } from '../ui'

/** A continuous edition; listening follows ayahs without changing the text's geometry. */
export function StudyView({ meta, surahId, ayah }: { meta: Meta; surahId: number; ayah?: number }) {
  const s = settings.value
  const surah = meta.surahs[surahId - 1]!
  const [current, setCurrent] = useState(ayah ?? 1)
  const [panels, setPanels] = useState<Record<number, StudyTab>>({})
  const [following, setFollowing] = useState(true)
  const [options, setOptions] = useState(false)
  const [companionOpen, setCompanionOpen] = useState(false)
  const reader = useRef<HTMLDivElement>(null)
  const anchor = useRef<HTMLElement | null>(null)
  const tab = panels[current] ?? 'translation'
  const p = player.value
  const playing = p && !p.commentary && p.ayahId >= surah.first && p.ayahId < surah.first + surah.ayahs ? p.ayahId - surah.first + 1 : undefined
  const data = useAsync(async () => {
    const ids = s.translations.filter(id => meta.translations.some(x => x.id === id))
    const [ar, ...trs] = await Promise.all([loadText(s.script), ...ids.map(id => loadTranslation(id))])
    return { ar, trs, ids }
  }, [s.script, s.translations.join(',')])
  const move = (n: number) => document.getElementById(`a-${n}`)?.scrollIntoView({ block: 'start', behavior: 'auto' })
  useEffect(() => setPanels({}), [surahId])
  useEffect(() => {
    if (!data.value) return
    setCurrent(Math.min(ayah ?? 1, surah.ayahs))
    move(Math.min(ayah ?? 1, surah.ayahs))
  }, [!!data.value, surahId, ayah])
  useEffect(() => {
    const layer = reader.current?.closest<HTMLElement>('.layer')
    if (!layer) return
    const suspend = () => { anchor.current = null; setCompanionOpen(false); setFollowing(false) }
    const key = (e: KeyboardEvent) => { if (['PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End', ' '].includes(e.key) && !(e.target instanceof Element && e.target.closest('button,input,[role="tab"]'))) suspend() }
    layer.addEventListener('wheel', suspend, { passive: true })
    layer.addEventListener('touchmove', suspend, { passive: true })
    layer.addEventListener('keydown', key)
    let frame = 0
    const observe = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        // Companion navigation intentionally holds its ayah while its full text is read.
        if (anchor.current) return
        const articles = reader.current?.querySelectorAll<HTMLElement>('article.ayah')
        let n = ayah ?? 1
        for (const el of articles ?? []) {
          if (el.getBoundingClientRect().top <= 160) n = Number(el.dataset.ayah)
          else break
        }
        setCurrent(n)
        setLastRead(surahId, n)
      })
    }
    layer.addEventListener('scroll', observe, { passive: true })
    return () => { cancelAnimationFrame(frame); layer.removeEventListener('wheel', suspend); layer.removeEventListener('touchmove', suspend); layer.removeEventListener('keydown', key); layer.removeEventListener('scroll', observe) }
  }, [surahId, ayah])
  useEffect(() => {
    if (playing === undefined || !following || !s.autoScroll) return
    anchor.current = null
    setCurrent(playing)
    move(playing)
  }, [playing, following, s.autoScroll])
  useEffect(() => {
    const resize = () => {
      const target = anchor.current ? `companion-${current}` : `a-${current}`
      document.getElementById(target)?.scrollIntoView({ block: 'start', behavior: 'auto' })
    }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [current])
  const navigate = (n: number) => {
    anchor.current = null
    setCompanionOpen(false)
    setFollowing(false)
    setCurrent(n)
    move(n)
  }
  const choose = (value: StudyTab) => {
    setFollowing(false)
    anchor.current = document.getElementById(`a-${current}`)
    setCompanionOpen(true)
    setPanels(previous => ({ ...previous, [current]: value }))
    requestAnimationFrame(() => document.getElementById(`companion-${current}`)?.scrollIntoView({ block: 'start' }))
  }
  const resume = () => { anchor.current = null; setCompanionOpen(false); setFollowing(true); if (playing !== undefined) { setCurrent(playing); move(playing) } }
  const returnArabic = () => { anchor.current = null; setCompanionOpen(false); move(current) }
  const tabs: [StudyTab, string][] = [['translation', t('ayahTranslation')], ['tafsir', t('tafsir')], ['words', t('words')]]
  return <div class="study-reader" ref={reader} style={{ '--study-ar-size': `${s.arabicSize}px`, '--study-tr-size': `${s.trSize}px` }}>
    <header class="study-toolbar">
      <div class="study-toolbar-start">
        <button class="study-menu" aria-label={t('menu')} onClick={() => { drawerOpen.value = true }}><Icon name="list" /></button>
        <button class="study-settings" aria-label={t('settings')} onClick={() => { drawerOpen.value = true }}><Icon name="settings" size={19} /><span>{t('settings')}</span></button>
      </div>
      <div class="study-location">
        <button aria-label={t('previous')} disabled={current <= 1} onClick={() => navigate(current - 1)}>‹</button>
        <button onClick={() => { gotoOpen.value = true }} aria-label={t('goTo')}><h1>{surahName(surah)} · {num(current)}</h1></button>
        <button aria-label={t('next')} disabled={current >= surah.ayahs} onClick={() => navigate(current + 1)}>›</button>
      </div>
      <div class="study-toolbar-end"><Logo /><button class="layer-close" aria-label={t('close')} onClick={closeLayer}><Icon name="close" /></button></div>
    </header>
    <div class="study-content">
      <div class="study-intro">
        <button class="btn" onClick={() => playFrom(surah.first + current - 1)}><Icon name="play" size={16} />{t('playFromHere')}</button>
        <button class="btn" aria-label={t('more')} aria-expanded={options} onClick={() => setOptions(!options)}><Icon name="more" size={16} /></button>
        {options ? <><button class="btn" onClick={() => playSurah(surahId)}>{t('playSurah')}</button><TranslationAudioToggle /><StudyIntroLink meta={meta} surah={surahId} /></> : null}
      </div>
      {data.error ? <LoadError retry={data.retry} /> : !data.value ? <Loading /> : <div class="ayahs">
        {surahId !== 1 && surahId !== 9 ? <p class="basmala" lang="ar" dir="rtl">{meta.basmala[s.script]}</p> : null}
        {Array.from({ length: surah.ayahs }, (_, i) => {
          const id = surah.first + i
          return <StudyVerse key={id} meta={meta} surah={surahId} n={i + 1} ar={data.value!.ar[id - 1]!}
            translations={data.value!.ids.map((idTr, k) => ({ info: meta.translations.find(x => x.id === idTr)!, text: data.value!.trs[k]![id - 1]! }))}
            active={current === i + 1} tab={panels[i + 1] ?? 'translation'} playing={playing === i + 1} paused={p?.status === 'paused' || p?.status === 'error'} focused={current === i + 1}
            onSelect={() => { if (!anchor.current) setCurrent(i + 1) }} />
        })}
      </div>}
      <nav class="study-surah-nav" aria-label={t('surahs')}>
        {surahId > 1 ? <a href={href.verse(surahId - 1)}>{num(surahId - 1)}. {surahName(meta.surahs[surahId - 2]!)}</a> : <span />}
        {surahId < 114 ? <a href={href.verse(surahId + 1)}>{num(surahId + 1)}. {surahName(meta.surahs[surahId]!)}</a> : null}
      </nav>
    </div>
    <div class="study-tools-shell">
      {playing !== undefined && !following ? <button class="study-follow" onClick={resume}>{t('studyFollow')}</button> : companionOpen ? <button class="study-follow" onClick={returnArabic}>{t('studyReturnArabic')}</button> : null}
      <div class="study-tabs study-tools" role="tablist" aria-label={t('reading')}>
        {tabs.map(([value, label], i) => <button key={value} id={`study-tab-${value}`} role="tab" aria-selected={tab === value} aria-controls={`companion-${current}`} tabIndex={tab === value ? 0 : -1} onClick={() => choose(value)} onKeyDown={e => {
          let next = i
          if (e.key === 'Home') next = 0
          else if (e.key === 'End') next = 2
          else if (e.key === 'ArrowRight') next = (i + (lang.value === 'fa' ? 2 : 1)) % 3
          else if (e.key === 'ArrowLeft') next = (i + (lang.value === 'fa' ? 1 : 2)) % 3
          else return
          e.preventDefault(); choose(tabs[next]![0]); document.getElementById(`study-tab-${tabs[next]![0]}`)?.focus()
        }}>{label}</button>)}
      </div>
    </div>
  </div>
}
