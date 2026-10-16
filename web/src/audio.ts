// Plays recitations: one MP3 per ayah, queued by the rules in playback.ts.
import { effect, signal } from '@preact/signals'
import { endOf, locate, TOTAL_AYAHS, type Meta, type PlayTo } from './data'
import { ayahRef, lang, t } from './i18n'
import { afterEnded, skipNext, skipPrevious, startCursor, type Cursor, type Phase, type Plan } from './playback'
import { audioTranslations, audioUrl, reciterById } from './reciters'
import { setLastRead, settings } from './store'
import type { StudyEntry } from './studyQuran'

export interface PlayerView {
  status: 'loading' | 'playing' | 'paused' | 'error'
  ayahId: number
  phase: Phase
  end: number
  commentary?: StudyEntry
}

export const player = signal<PlayerView | null>(null)
/** "Repeat this ayah" is on: the ayah being recited plays again and again until it is turned off. */
export const looping = signal(false)
export const audioProgress = signal({ elapsed: 0, duration: 0 })
let commentaryQueue: StudyEntry[] = []
let commentaryIndex = 0

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
  return { end, repeat: looping.peek() ? Number.POSITIVE_INFINITY : s.repeat, translation: audioTranslations.some((a) => a.id === s.audioTranslation) }
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
  if (cursor) player.value = { status, ayahId: cursor.ayahId, phase: cursor.phase, end: plan.end, commentary: commentaryQueue[commentaryIndex] }
}

function updateMediaSession(c: Cursor) {
  if (!('mediaSession' in navigator) || !meta) return
  const { surah, ayah } = locate(meta, c.ayahId)
  navigator.mediaSession.metadata = new MediaMetadata({
    title: commentaryQueue.length ? `${t('commentary')} · ${surah}:${ayah}` : ayahRef(meta.surahs[surah - 1]!, ayah),
    artist: commentaryQueue[commentaryIndex]?.audio?.voice ?? reciterById(settings.value.reciter)[lang.value],
    album: commentaryQueue.length ? t('studyQuranName') : t('appName'),
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
  if (commentaryQueue.length) {
    if (commentaryIndex + 1 < commentaryQueue.length) loadCommentary(commentaryIndex + 1)
    else setView('paused')
    return
  }
  if (!cursor) return
  const next = afterEnded(cursor, plan)
  if (next) load(next)
  else {
    // Finished: leave the player showing the last ayah, paused.
    setView('paused')
  }
})

audio.addEventListener('timeupdate', () => {
  if (commentaryQueue.length) audioProgress.value = {
    elapsed: audio.currentTime,
    duration: Number.isFinite(audio.duration) ? audio.duration : commentaryQueue[commentaryIndex]!.audio!.duration,
  }
})

export function commentaryAudioUrl(entry: StudyEntry): string {
  if (!entry.audio) throw new Error('Commentary recording is not installed')
  return new URL(`${import.meta.env.BASE_URL}data/commentary-audio/${entry.audio.file}?v=${entry.audio.sha256}`, document.baseURI).href
}

/** Queue note IDs, not ayahs: multi-ayah passages play once. No recitation can overlap this player. */
export function playCommentary(entry: StudyEntry, entries: StudyEntry[] = [entry]) {
  if (!meta || !entry.audio) return
  const seen = new Set<string>()
  commentaryQueue = entries.filter((e) => {
    if (!e.audio || e.surah_id !== entry.surah_id || seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })
  if (!commentaryQueue.some((e) => e.id === entry.id)) commentaryQueue = [entry]
  looping.value = false
  preloader.removeAttribute('src')
  preloader.load()
  loadCommentary(commentaryQueue.findIndex((e) => e.id === entry.id))
}

function loadCommentary(index: number) {
  if (!meta || !commentaryQueue[index]?.audio) return
  const entry = commentaryQueue[index]!
  commentaryIndex = index
  cursor = { ayahId: meta.surahs[entry.surah_id - 1]!.first + entry.first_ayah - 1, phase: 'ayah', repeatLeft: 1 }
  plan = { end: cursor.ayahId, repeat: 1, translation: false }
  audioProgress.value = { elapsed: 0, duration: entry.audio!.duration }
  audio.src = commentaryAudioUrl(entry)
  audio.defaultPlaybackRate = settings.peek().speed
  audio.playbackRate = settings.peek().speed
  setView('loading')
  void audio.play().catch((error: unknown) => {
    if ((error as DOMException)?.name !== 'AbortError') setView((error as DOMException)?.name === 'NotAllowedError' ? 'paused' : 'error')
  })
  updateMediaSession(cursor)
}

export function seekCommentary(seconds: number) {
  if (!commentaryQueue.length || !Number.isFinite(seconds)) return
  audio.currentTime = Math.max(0, Math.min(audioProgress.peek().duration, seconds))
}

/** Start playing at `ayahId` and keep going until the end of `scope`. */
export function playFrom(ayahId: number, scope: PlayTo = settings.value.playTo, withBasmala = false) {
  if (!meta) return
  commentaryQueue = []
  looping.value = false
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
  if (p && !p.commentary && p.ayahId === ayahId && p.status !== 'error') toggle()
  else playFrom(ayahId, scope)
}

/** Turn "repeat this ayah" on or off for `ayahId`. Turning it on plays that ayah (from the start, unless it is the one
 * playing) with an endless repeat, which the playback rules already honour; turning it off lets the current
 * recording finish and carries on as planned, so the audio does not restart mid-word. */
export function loopAyah(ayahId: number, on: boolean) {
  if (!meta) return
  if (!on) {
    looping.value = false
    plan = { ...plan, repeat: settings.peek().repeat }
    if (cursor) cursor = { ...cursor, repeatLeft: 1 }
    return
  }
  if (commentaryQueue.length || !cursor || cursor.ayahId !== ayahId || player.peek()?.status === 'error') playFrom(ayahId)
  looping.value = true
  plan = { ...plan, repeat: Number.POSITIVE_INFINITY }
  if (cursor) cursor = { ...cursor, repeatLeft: Number.POSITIVE_INFINITY }
}

export function toggle() {
  const p = player.value
  if (!p || !cursor) return
  if (commentaryQueue.length) {
    if (p.status === 'error' || audio.ended) loadCommentary(commentaryIndex)
    else if (audio.paused) void audio.play().catch(() => setView('error'))
    else audio.pause()
    return
  }
  if (p.status === 'error') return load(cursor)
  if (audio.ended || (!audio.src && cursor)) return load({ ...cursor, phase: 'ayah', repeatLeft: plan.repeat })
  if (audio.paused) void audio.play().catch(() => setView('error'))
  else audio.pause()
}

/** Skipping to another ayah ends "repeat this ayah": the new one plays as the settings say. */
function endLoop() {
  if (!looping.peek()) return
  looping.value = false
  plan = { ...plan, repeat: settings.peek().repeat }
}

export function next() {
  if (commentaryQueue.length) return loadCommentary(commentaryIndex + 1)
  endLoop()
  const c = cursor && skipNext(cursor, plan, TOTAL_AYAHS)
  if (c) load(c)
}

export function previous() {
  if (commentaryQueue.length) return loadCommentary(commentaryIndex - 1)
  endLoop()
  const c = cursor && skipPrevious(cursor, plan)
  if (c) load(c)
}

export function stop() {
  audio.pause()
  audio.removeAttribute('src')
  audio.load()
  preloader.removeAttribute('src')
  cursor = null
  commentaryQueue = []
  audioProgress.value = { elapsed: 0, duration: 0 }
  looping.value = false
  player.value = null
}

// Settings that apply while playing.
effect(() => {
  const s = settings.value
  audio.defaultPlaybackRate = s.speed
  audio.playbackRate = s.speed
  if (cursor && meta && !commentaryQueue.length) {
    plan = { ...currentPlan(endOf(meta, cursor.ayahId, s.playTo)) }
    // peek(): read the player without subscribing to it. Subscribing would make every ayah change re-run this
    // effect, which writes the player again: a cycle that stopped playback after a setting changed mid-recitation.
    const view = player.peek()
    if (view) player.value = { ...view, end: plan.end }
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
