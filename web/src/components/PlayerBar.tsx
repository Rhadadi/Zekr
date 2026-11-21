import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { audioProgress, loopAyah, looping, next, player, previous, seek, stop, toggle } from '../audio'
import { type Meta, locate } from '../data'
import { IN_BAR_QUERY, ON_TOP_QUERY, useMedia } from '../hooks'
import { ayahRef, num, surahName, t } from '../i18n'
import { href } from '../router'
import { Icon } from './Icon'
import { PlaybackOptions, PlaybackSpeed } from './PlaybackOptions'
import { sheetOpen } from '../ui'
import { TranslationAudioToggle } from './TranslationAudioToggle'

export function PlayerBar({ meta, study = false }: { meta: Meta; study?: boolean }) {
  const p = player.value
  const [open, setOpen] = useState(false)
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
      root.style.setProperty('--player-h', inBar || onTop ? '0px' : `${el.offsetHeight}px`)
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
  }, [showing, inBar, onTop])
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
      <div class={`player${entry ? ' has-commentary' : ''}${inBar ? ' in-bar' : ''}${onTop ? ' on-top' : ''}`} ref={bar} role="region" aria-label={label} data-status={p.status}>
        <a class="player-info" href={destination} aria-label={destinationLabel} aria-hidden={compactInfo || undefined} tabIndex={compactInfo ? -1 : undefined}>
          <strong>{surahName(meta.surahs[surah - 1]!)} {num(surah)}:{num(ayah)}</strong>
          {p.status === 'error' || p.phase !== 'ayah' || entry ? (
            <span class="muted small">{p.status === 'error' ? t('audioError') : entry ? `${label} · ${entry.audio!.voice}` : p.phase === 'translation' ? t('audioTranslation') : 'بسم الله'}</span>
          ) : null}
        </a>
        <div class="player-controls" dir="ltr">
          <button class="icon-btn player-step" onClick={previous} aria-label={t(entry ? 'prevNote' : 'previous')}><Icon name="prev" size={20} /></button>
          <button class="icon-btn big" onClick={toggle} aria-label={playing ? t('pause') : t('play')}>
            <Icon name={playing ? 'pause' : 'play'} size={24} />
          </button>
          <button class="icon-btn player-step" onClick={next} aria-label={t(entry ? 'nextNote' : 'next')}><Icon name="next" size={20} /></button>
          {!entry ? <button class="icon-btn player-repeat" onClick={() => loopAyah(p.ayahId, !looping.value)} aria-pressed={looping.value} aria-label={t('repeatAyah')}><Icon name="repeat" size={20} /></button> : null}
          {/* the less frequent ones (translation audio, reciter, speed, stopping) are in one place */}
          <button class="icon-btn" onClick={() => setOpen(true)} aria-label={label} aria-haspopup="dialog"><Icon name="more" size={20} /></button>
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
