import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { loopAyah, looping, next, player, previous, stop, toggle } from '../audio'
import { type Meta, locate } from '../data'
import { ayahRef, num, surahName, t } from '../i18n'
import { href } from '../router'
import { Icon } from './Icon'
import { PlaybackOptions } from './PlaybackOptions'
import { TranslationAudioToggle } from './TranslationAudioToggle'

export function PlayerBar({ meta }: { meta: Meta }) {
  const p = player.value
  const [open, setOpen] = useState(false)
  const bar = useRef<HTMLDivElement>(null)
  // Everything that sits at the bottom of the screen (the translation box, layers, the toast) leaves room for the bar.
  const showing = !!p
  useLayoutEffect(() => {
    const el = bar.current
    const root = document.documentElement
    if (!el) return
    const set = () => root.style.setProperty('--player-h', `${el.offsetHeight}px`)
    set()
    const observer = new ResizeObserver(set)
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--player-h')
    }
  }, [showing])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (!p) return null
  const { surah, ayah } = locate(meta, p.ayahId)
  const playing = p.status === 'playing' || p.status === 'loading'
  return (
    <>
      <div class="player" ref={bar} role="region" aria-label={t('recitation')} data-status={p.status}>
        <a class="player-info" href={href.ayah(surah, ayah)} aria-label={`${t('nowReciting')}: ${ayahRef(meta.surahs[surah - 1]!, ayah)}`}>
          <strong>{surahName(meta.surahs[surah - 1]!)} {num(surah)}:{num(ayah)}</strong>
          {p.status === 'error' || p.phase !== 'ayah' ? (
            <span class="muted small">{p.status === 'error' ? t('audioError') : p.phase === 'translation' ? t('audioTranslation') : 'بسم الله'}</span>
          ) : null}
        </a>
        <div class="player-controls" dir="ltr">
          <button class="icon-btn" onClick={previous} aria-label={t('previous')}><Icon name="prev" size={20} /></button>
          <button class="icon-btn big" onClick={toggle} aria-label={playing ? t('pause') : t('play')}>
            <Icon name={playing ? 'pause' : 'play'} size={24} />
          </button>
          <button class="icon-btn" onClick={next} aria-label={t('next')}><Icon name="next" size={20} /></button>
          <button class="icon-btn" onClick={() => loopAyah(p.ayahId, !looping.value)} aria-pressed={looping.value} aria-label={t('repeatAyah')}><Icon name="repeat" size={20} /></button>
          {/* the less frequent ones (translation audio, reciter, speed, stopping) are in one place */}
          <button class="icon-btn" onClick={() => setOpen(true)} aria-label={t('recitation')} aria-haspopup="dialog"><Icon name="more" size={20} /></button>
        </div>
      </div>
      {open ? (
        <div class="sheet-backdrop" onClick={() => setOpen(false)}>
          <div class="sheet" role="dialog" aria-modal="true" aria-label={t('recitation')} onClick={(e) => e.stopPropagation()}>
            <div class="sheet-head">
              <h2>{t('recitation')}</h2>
              <button class="icon-btn" onClick={() => setOpen(false)} aria-label={t('close')}><Icon name="close" /></button>
            </div>
            <div class="player-sheet-row">
              <TranslationAudioToggle />
              <button class="btn" onClick={() => { setOpen(false); stop() }}><Icon name="close" size={18} /> {t('stopRecitation')}</button>
            </div>
            <PlaybackOptions />
          </div>
        </div>
      ) : null}
    </>
  )
}
