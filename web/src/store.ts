import { signal } from '@preact/signals'
import type { PlayTo, Script } from './data'
import type { Period } from './rotation'

export interface DailySettings {
  period: Period
  /** 'all' draws from every ayah; 'fits' only from ayahs that fit in full on the widget. */
  pool: 'all' | 'fits'
  /** Which translations the card shows besides the Arabic. */
  show: 'fa' | 'en' | 'both' | 'ar'
  fa: string
  en: string
  salt: number
}

export interface Settings {
  lang: 'auto' | 'fa' | 'en'
  theme: 'auto' | 'light' | 'sepia' | 'dark'
  script: Script
  /** 'verse': one ayah at a time with translations. 'page': flowing mushaf page. */
  readMode: 'verse' | 'page'
  arabicSize: number
  trSize: number
  /** Translation ids shown in the reader, in order. */
  translations: string[]
  reciter: string
  speed: number
  /** How many times each ayah is played (1 = once). */
  repeat: number
  playTo: PlayTo
  /** Play a translation recording after each ayah ('off' or an audio translation id). */
  audioTranslation: string
  autoScroll: boolean
  daily: DailySettings
}

export const defaultSettings: Settings = {
  lang: 'auto',
  theme: 'auto',
  script: 'uthmani',
  readMode: 'verse',
  arabicSize: 30,
  trSize: 17,
  translations: ['fa.safavi'],
  reciter: 'minshawi-murattal',
  speed: 1,
  repeat: 1,
  playTo: 'surah',
  audioTranslation: 'off',
  autoScroll: true,
  daily: { period: 86400, pool: 'all', show: 'fa', fa: 'fa.safavi', en: 'en.sahih', salt: 0 },
}

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode or full storage: keep working without saving */
  }
}

function loadSettings(): Settings {
  const saved = read<Partial<Settings>>('zekr.settings') ?? {}
  return { ...defaultSettings, ...saved, daily: { ...defaultSettings.daily, ...saved.daily } }
}

export const settings = signal<Settings>(loadSettings())

export function updateSettings(patch: Partial<Settings>) {
  settings.value = { ...settings.value, ...patch }
  write('zekr.settings', settings.value)
}

export function updateDaily(patch: Partial<DailySettings>) {
  updateSettings({ daily: { ...settings.value.daily, ...patch } })
}

export interface Bookmark {
  id: number
  at: number
}

export const bookmarks = signal<Bookmark[]>(read<Bookmark[]>('zekr.bookmarks') ?? [])

export function isBookmarked(id: number): boolean {
  return bookmarks.value.some((b) => b.id === id)
}

export function toggleBookmark(id: number) {
  bookmarks.value = isBookmarked(id) ? bookmarks.value.filter((b) => b.id !== id) : [{ id, at: Date.now() }, ...bookmarks.value]
  write('zekr.bookmarks', bookmarks.value)
}

export interface LastRead {
  surah: number
  ayah: number
}

export const lastRead = signal<LastRead | null>(read<LastRead>('zekr.lastRead') ?? null)

export function setLastRead(surah: number, ayah: number) {
  lastRead.value = { surah, ayah }
  write('zekr.lastRead', lastRead.value)
}
