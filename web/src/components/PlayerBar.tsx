import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { audioProgress, loopAyah, looping, next, player, previous, seek, stop, toggle } from '../audio'
import { settings, updateSettings } from '../store'
import { type Meta, locate } from '../data'
import { IN_BAR_QUERY, ON_TOP_QUERY, WIDE_QUERY, useMedia } from '../hooks'
import { ayahRef, num, surahName, t } from '../i18n'
import { href } from '../router'
import { Icon } from './Icon'
import { PlaybackOptions, PlaybackSpeed, SPEEDS } from './PlaybackOptions'
import { sheetOpen } from '../ui'
import { TranslationAudioToggle } from './TranslationAudioToggle'

type Pos = { x: number; y: number }
const savedPos = (): Pos | null => { try { const v = JSON.parse(localStorage.getItem('zekr.playerPos') ?? 'null'); return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null } catch { return null } }
const savePos = (v: Pos | null) => { try { v ? localStorage.setItem('zekr.playerPos', JSON.stringify(v)) : localStorage.removeItem('zekr.playerPos') } catch { /* a convenience only */ } }

export function PlayerBar({ meta, study = false }: { meta: Meta; study?: boolean }) {
  const p = player.value
  const [open, setOpen] = useState(false)
  // On a computer the recitation sits in the top bar, beside the menu button; dragged by its grip it floats wherever it
  // is put (remembered), and its button puts it back. A tafsir's recording (with its seek bar) floats from the start.
  const wide = useMedia(WIDE_QUERY) && !study
  const [pos, setPos] = useState<Pos | null>(savedPos)
  const floating = wide && (!!pos || !!p?.commentary)
  const docked = wide && !floating
  const clamp = (v: Pos, el: HTMLElement): Pos => ({
    x: Math.round(Math.max(8, Math.min(innerWidth - el.offsetWidth - 8, v.x))),
    y: Math.round(Math.max(8, Math.min(innerHeight - el.offsetHeight - 8, v.y))),
  })
  const drag = (e: PointerEvent) => {
    if (e.button !== 0) return
    const el = bar.current
    if (!el) return
    e.preventDefault()
    const grip = e.currentTarget as HTMLElement
    grip.setPointerCapture(e.pointerId)
    const r = el.getBoundingClientRect()
    const dx = e.clientX - r.left
    const dy = e.clientY - r.top
    let last: Pos | null = null
    const move = (m: PointerEvent) => { last = clamp({ x: m.clientX - dx, y: m.clientY - dy }, el); setPos(last) }
    const up = () => {
      grip.removeEventListener('pointermove', move)
      grip.removeEventListener('pointerup', up)
      grip.removeEventListener('pointercancel', up)
      if (last) savePos(last)
    }
    grip.addEventListener('pointermove', move)
    grip.addEventListener('pointerup', up)
    grip.addEventListener('pointercancel', up)
  }
  const dock = () => { setPos(null); savePos(null) }
  // kept on the screen when the window gets smaller
  useEffect(() => {
    if (!pos) return
    const fit = () => { const el = bar.current; if (el) setPos((v) => (v ? clamp(v, el) : v)) }
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [!!pos])
  const speed = settings.value.speed
  const nextSpeed = () => updateSettings({ speed: SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1 })
  const bar = useRef<HTMLDivElement>(null)
  // Everything that sits at the bottom of the screen (the translation box, layers, the toast) leaves room for the bar.
  // While the phone's sheet is open the bar is not shown: the sheet takes its place (one panel at the bottom).
  const showing = !!p && !sheetOpen.value
  // a phone on its side: the controls sit in the top bar and take nothing from the bottom of the screen
  const inBar = useMedia(IN_BAR_QUERY) && !study
  // held upright: just the controls, in a strip under the top bar, which already names the surah and page; the bottom
  // of the screen is left to the page and the ayah's panel. A tafsir's recording keeps its seek bar and voice below.
  const onTop = useMedia(ON_TOP_QUERY) && !inBar && !study && !p?.commentary
  useLayoutEffect(() => {
    const el = bar.current
    const root = document.documentElement
    if (!el) return
    let was = 0
    const set = () => {
      root.style.setProperty('--player-h', inBar || onTop || wide ? '0px' : `${el.offsetHeight}px`)
      const top = onTop ? el.offsetHeight : 0
      root.style.setProperty('--player-top', `${top}px`)
      // the page begins under the strip (the layout follows it): scrolled down, what is read stays where it is
      if (top !== was && window.scrollY > 0) window.scrollBy(0, top - was)
      was = top
    }
    set()
    const observer = new ResizeObserver(set)
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (was && window.scrollY > 0) window.scrollBy(0, -was)
      root.style.removeProperty('--player-h')
      root.style.removeProperty('--player-top')
    }
  }, [showing, inBar, onTop, wide])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (!p || !showing) return null
  const { surah, ayah } = locate(meta, p.ayahId)
  const playing = p.status === 'playing' || p.status === 'loading'
  const entry = p.commentary
  const label = t(entry ? 'commentaryAudio' : 'recitation')
  const destination = entry ? href.commentary(surah, ayah) : study ? href.verse(surah, ayah) : href.ayah(surah, ayah)
  const destinationLabel = `${entry ? label : t('nowReciting')}: ${ayahRef(meta.surahs[surah - 1]!, ayah)}`
  const compactInfo = (inBar || onTop) && p.status !== 'error'
  const time = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`
  return (
    <>
      <div class={`player${entry ? ' has-commentary' : ''}${inBar ? ' in-bar' : ''}${onTop ? ' on-top' : ''}${docked ? ' desk-bar' : ''}${floating ? ` desk-float${pos ? ' placed' : ''}` : ''}`}
        ref={bar} role="region" aria-label={label} data-status={p.status} data-testid="player"
        style={floating && pos ? { left: `${pos.x}px`, top: `${pos.y}px` } : undefined}>
        {wide ? (
          <button class="icon-btn player-grip" onPointerDown={drag} onDblClick={dock} aria-label={t('movePlayer')} title={t('movePlayer')}
            onKeyDown={(e) => {
              const el = bar.current
              const by = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[e.key]
              if (!by || !el) return
              e.preventDefault()
              const r = el.getBoundingClientRect()
              const v = clamp({ x: r.left + by[0]!, y: r.top + by[1]! }, el)
              setPos(v); savePos(v)
            }}><Icon name="grip" size={18} /></button>
        ) : null}
        <a class="player-info" href={destination} aria-label={destinationLabel} aria-hidden={compactInfo || docked || undefined} tabIndex={compactInfo || docked ? -1 : undefined}>
          <strong>{surahName(meta.surahs[surah - 1]!)} {num(surah)}:{num(ayah)}</strong>
          {p.status === 'error' || p.phase !== 'ayah' || entry ? (
            <span class="muted small">{p.status === 'error' ? t('audioError') : entry ? `${label} · ${entry.audio!.voice}` : p.phase === 'translation' ? t('audioTranslation') : 'بسم الله'}</span>
          ) : null}
        </a>
        {/* in the top bar: the ayah being recited, short, and a link to it */}
        {docked ? <a class="player-ref" href={destination} aria-label={destinationLabel} title={destinationLabel}>{num(surah)}:{num(ayah)}</a> : null}
        <div class="player-controls" dir="ltr">
          <button class="icon-btn player-step" onClick={previous} aria-label={t(entry ? 'prevNote' : 'previous')}><Icon name="prev" size={20} /></button>
          <button class="icon-btn big" onClick={toggle} aria-label={playing ? t('pause') : t('play')}>
            <Icon name={playing ? 'pause' : 'play'} size={24} />
          </button>
          <button class="icon-btn player-step" onClick={next} aria-label={t(entry ? 'nextNote' : 'next')}><Icon name="next" size={20} /></button>
          {!entry ? <button class="icon-btn player-repeat" onClick={() => loopAyah(p.ayahId, !looping.value)} aria-pressed={looping.value} aria-label={t('repeatAyah')}><Icon name="repeat" size={20} /></button> : null}
          {/* the less frequent ones (translation audio, reciter, speed, stopping) are in one place */}
          <button class="player-speed" onClick={nextSpeed} aria-label={`${t('speed')}: ${speed}×`} title={t('speed')}>{num(speed)}×</button>
          <button class="icon-btn" onClick={() => setOpen(true)} aria-label={label} aria-haspopup="dialog"><Icon name="more" size={20} /></button>
          {floating && !entry ? <button class="icon-btn player-dock" onClick={dock} aria-label={t('dockPlayer')} title={t('dockPlayer')}><Icon name="dock" size={18} /></button> : null}
          <button class="icon-btn player-close" onClick={stop} aria-label={t(entry ? 'stop' : 'stopRecitation')} title={t(entry ? 'stop' : 'stopRecitation')}><Icon name="close" size={18} /></button>
        </div>
        {entry || study ? <div class="commentary-seek" dir="ltr">
          <span>{time(audioProgress.value.elapsed)}</span>
          <input type="range" aria-label={t('playbackPosition')} min="0" max={Math.max(1, audioProgress.value.duration)} step="0.1"
            disabled={audioProgress.value.duration <= 0}
            value={Math.min(audioProgress.value.elapsed, audioProgress.value.duration)} onInput={(e) => seek(Number(e.currentTarget.value))} />
          <span>{time(audioProgress.value.duration)}</span>
        </div> : null}
        {onTop ? <span class="player-progress" aria-hidden="true"
          style={{ '--p': audioProgress.value.duration > 0 ? Math.min(1, audioProgress.value.elapsed / audioProgress.value.duration) : 0 }} /> : null}
      </div>
      {open ? (
        <div class="sheet-backdrop" onClick={() => setOpen(false)}>
          <div class="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
            <div class="sheet-head">
              <h2>{label}</h2>
              <button class="icon-btn" onClick={() => setOpen(false)} aria-label={t('close')}><Icon name="close" /></button>
            </div>
            <div class="player-sheet-row">
              {inBar || onTop ? <a class="btn" href={destination} aria-label={destinationLabel} onClick={() => setOpen(false)}><Icon name="goto" size={18} />{ayahRef(meta.surahs[surah - 1]!, ayah)}</a> : null}
              {!entry ? <TranslationAudioToggle /> : null}
              <button class="btn" onClick={() => { setOpen(false); stop() }}><Icon name="close" size={18} /> {t(entry ? 'stop' : 'stopRecitation')}</button>
            </div>
            {entry ? <div class="form"><PlaybackSpeed /></div> : <PlaybackOptions />}
          </div>
        </div>
      ) : null}
    </>
  )
}
