// Plays recitations: one MP3 per ayah, queued by the rules in playback.ts.
import { effect, signal } from '@preact/signals'
import { endOf, locate, TOTAL_AYAHS, type Meta, type PlayTo } from './data'
import { ayahRef, lang, t } from './i18n'
import { afterEnded, skipNext, skipPrevious, startCursor, type Cursor, type Phase, type Plan } from './playback'
import { audioTranslations, audioUrl, reciterById } from './reciters'
import { setLastRead, settings } from './store'

export interface PlayerView {
  status: 'loading' | 'playing' | 'paused' | 'error'
  ayahId: number
  phase: Phase
  end: number
}

export const player = signal<PlayerView | null>(null)

const audio = new Audio()
const preloader = new Audio()
preloader.preload = 'auto'

let meta: Meta | null = null
let cursor: Cursor | null = null
let plan: Plan = { end: 0, repeat: 1, translation: false }

/** Call once the metadata has loaded, so playback can start synchronously inside a tap (iOS Safari needs that). */
export function initAudio(m: Meta) {
  meta = m
}

function currentPlan(end: number): Plan {
  const s = settings.value
  return { end, repeat: s.repeat, translation: audioTranslations.some((a) => a.id === s.audioTranslation) }
}

function urlFor(c: Cursor): string {
  const { surah, ayah } = locate(meta as Meta, c.ayahId)
  const s = settings.value
  if (c.phase === 'translation') {
    const tr = audioTranslations.find((a) => a.id === s.audioTranslation)
    if (tr) return audioUrl(tr.folder, surah, ayah)
  }
  const folder = reciterById(s.reciter).folder
  return c.phase === 'basmala' ? audioUrl(folder, 1, 1) : audioUrl(folder, surah, ayah)
}

function setView(status: PlayerView['status']) {
  if (cursor) player.value = { status, ayahId: cursor.ayahId, phase: cursor.phase, end: plan.end }
}

function updateMediaSession(c: Cursor) {
  if (!('mediaSession' in navigator) || !meta) return
  const { surah, ayah } = locate(meta, c.ayahId)
  navigator.mediaSession.metadata = new MediaMetadata({
    title: ayahRef(meta.surahs[surah - 1]!, ayah),
    artist: reciterById(settings.value.reciter)[lang.value],
    album: t('appName'),
  })
}

function load(c: Cursor) {
  if (!meta) return
  cursor = c
  const url = urlFor(c)
  const speed = settings.value.speed
  setView('loading')
  if (audio.src === url) {
    audio.currentTime = 0
  } else {
    audio.src = url
  }
  audio.defaultPlaybackRate = speed
  audio.playbackRate = speed
  audio.play().catch((e: unknown) => {
    if ((e as DOMException)?.name === 'AbortError') return // interrupted by the next load
    setView((e as DOMException)?.name === 'NotAllowedError' ? 'paused' : 'error')
  })
  const { surah, ayah } = locate(meta, c.ayahId)
  if (c.phase !== 'translation') setLastRead(surah, ayah)
  const upcoming = afterEnded(c, plan)
  if (upcoming) preloader.src = urlFor(upcoming)
  updateMediaSession(c)
}

audio.addEventListener('playing', () => setView('playing'))
audio.addEventListener('waiting', () => setView('loading'))
audio.addEventListener('pause', () => {
  if (cursor && !audio.ended) setView('paused')
})
audio.addEventListener('error', () => {
  if (cursor && audio.getAttribute('src')) setView('error')
})
audio.addEventListener('ended', () => {
  if (!cursor) return
  const next = afterEnded(cursor, plan)
  if (next) load(next)
  else {
    // Finished: leave the player showing the last ayah, paused.
    setView('paused')
  }
})

/** Start playing at `ayahId` and keep going until the end of `scope`. */
export function playFrom(ayahId: number, scope: PlayTo = settings.value.playTo, withBasmala = false) {
  if (!meta) return
  plan = currentPlan(endOf(meta, ayahId, scope))
  const { surah, ayah } = locate(meta, ayahId)
  load(startCursor(ayahId, surah, ayah, plan, withBasmala))
}

export function playSurah(surahId: number) {
  if (!meta) return
  playFrom((meta.surahs[surahId - 1] as { first: number }).first, 'surah', true)
}

/** Tap on an ayah's play button: pause/resume if it is the current ayah, otherwise start there. */
export function toggleAyah(ayahId: number, scope?: PlayTo) {
  const p = player.value
  if (p && p.ayahId === ayahId && p.status !== 'error') toggle()
  else playFrom(ayahId, scope)
}

export function toggle() {
  const p = player.value
  if (!p || !cursor) return
  if (p.status === 'error') return load(cursor)
  if (audio.ended || (!audio.src && cursor)) return load({ ...cursor, phase: 'ayah', repeatLeft: plan.repeat })
  if (audio.paused) void audio.play().catch(() => setView('error'))
  else audio.pause()
}

export function next() {
  const c = cursor && skipNext(cursor, plan, TOTAL_AYAHS)
  if (c) load(c)
}

export function previous() {
  const c = cursor && skipPrevious(cursor, plan)
  if (c) load(c)
}

export function stop() {
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
  preloader.removeAttribute('src')
  cursor = null
  player.value = null
}

// Settings that apply while playing.
effect(() => {
  const s = settings.value
  audio.defaultPlaybackRate = s.speed
  audio.playbackRate = s.speed
  if (cursor && meta) {
    plan = { ...currentPlan(endOf(meta, cursor.ayahId, s.playTo)) }
    if (player.value) player.value = { ...player.value, end: plan.end }
  }
})

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession
  ms.setActionHandler('play', () => toggle())
  ms.setActionHandler('pause', () => toggle())
  ms.setActionHandler('nexttrack', () => next())
  ms.setActionHandler('previoustrack', () => previous())
  ms.setActionHandler('stop', () => stop())
}
