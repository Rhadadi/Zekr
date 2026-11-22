import { signal } from '@preact/signals'
import type { PlayTo, Script } from './data'
import { fitToFont, DEFAULT_QURAN_FONT, type QuranFont } from './fonts'
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

/** Where the mushaf shows an ayah's translation: in the side panel (the sheet on a phone), in a card over the page under
 * the ayah, inline under every ayah in the text, or not on the page at all. */
export type TranslationPlace = 'panel' | 'card' | 'inline' | 'words' | 'off'

/** The printed page's text as in the picture, or set in the chosen Quran font inside the same printed frame. */
export type PageStyle = 'printed' | 'text'

/** The printed pages are recoloured with a filter; 'blue' is the edition as printed. */
export type PageColor = 'blue' | 'green' | 'purple' | 'pink' | 'dark'

export interface Settings {
  lang: 'auto' | 'fa' | 'en'
  theme: 'auto' | 'light' | 'sepia' | 'dark'
  script: Script
  /** Arabic font for the Quran text. */
  quranFont: QuranFont
  translationPlace: TranslationPlace
  pageStyle: PageStyle
  pageColor: PageColor
  arabicSize: number
  trSize: number
  /** A soft panel behind the translations. */
  trBackground: boolean
  /** Translation ids shown in the reader, in order. */
  translations: string[]
  reciter: string
  speed: number
  /** How many times each ayah is played (1 = once). */
  repeat: number
  playTo: PlayTo
  /** Play a translation recording after each ayah ('off' or an audio translation id). */
  audioTranslation: string
  /** The translation recording last switched on, so the quick switch brings it back. */
  lastAudioTranslation: string
  autoScroll: boolean
  daily: DailySettings
}

export const defaultSettings: Settings = {
  lang: 'fa',
  theme: 'auto',
  script: 'uthmani',
  quranFont: 'scheherazade',
  translationPlace: 'inline',
  pageStyle: 'text',
  pageColor: 'blue',
  arabicSize: 26,
  trSize: 16,
  trBackground: false,
  translations: ['fa.fooladvand'],
  reciter: 'minshawi-murattal',
  speed: 1,
  repeat: 1,
  playTo: 'surah',
  audioTranslation: 'off',
  lastAudioTranslation: '',
  autoScroll: true,
  daily: { period: 86400, pool: 'all', show: 'fa', fa: 'fa.fooladvand', en: 'en.sahih', salt: 0 },
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

/** Settings as saved by older versions: the box-position choice became "where translations show", and the reading
 * view is gone (the mushaf is the only reading screen). The old keys are not kept. */
export function migrateSettings(saved: Record<string, unknown>, persianDefault = false, inlineDefault = false): Partial<Settings> {
  const { pageBox, readMode: _readMode, ...rest } = saved as Record<string, unknown> & { pageBox?: string; readMode?: string }
  // Persian is the default language: a saved "follow the device" from before becomes Persian, once
  if (persianDefault && rest.lang === 'auto') rest.lang = 'fa'
  if (rest.translationPlace === undefined && pageBox !== undefined) rest.translationPlace = pageBox === 'popup' ? 'card' : 'panel'
  // the translation under the lines is the default: the old default, the panel, becomes it, once
  if (inlineDefault && rest.translationPlace === 'panel') rest.translationPlace = 'inline'
  return rest as Partial<Settings>
}

function loadSettings(): Settings {
  const firstFa = read<boolean>('zekr.persianDefault') === undefined
  const firstInline = read<boolean>('zekr.inlineDefault') === undefined
  const saved = migrateSettings(read<Record<string, unknown>>('zekr.settings') ?? {}, firstFa, firstInline)
  // the sizes were smaller by default from here on: a size that is still the old default follows the new one, once
  const firstSize = read<boolean>('zekr.sizesV2') === undefined
  if (firstSize) {
    if (saved.arabicSize === 30) delete saved.arabicSize
    if (saved.trSize === 17) delete saved.trSize
    write('zekr.sizesV2', true)
  }
  // Scheherazade and Fooladvand became the defaults: what was still the old default (the printed page, Hafs, Safavi
  // alone) follows the new one, once
  const moved = read<boolean>('zekr.defaultsV3') === undefined || firstSize || firstFa || firstInline
  if (read<boolean>('zekr.defaultsV3') === undefined) {
    if (saved.pageStyle === 'printed') delete saved.pageStyle
    if (saved.quranFont === DEFAULT_QURAN_FONT) delete saved.quranFont
    if (saved.translations?.length === 1 && saved.translations[0] === 'fa.safavi') delete saved.translations
    if (saved.daily?.fa === 'fa.safavi') saved.daily = { ...saved.daily, fa: 'fa.fooladvand' }
    write('zekr.defaultsV3', true)
  }
  if (firstFa) write('zekr.persianDefault', true)
  if (firstInline) write('zekr.inlineDefault', true)
  const result = { ...defaultSettings, ...saved, daily: { ...defaultSettings.daily, ...saved.daily } }
  // what a one-time step changed is kept, or the old value would come back on the next visit
  if (moved && read('zekr.settings')) write('zekr.settings', result)
  return result
}

export const settings = signal<Settings>(loadSettings())

export function updateSettings(patch: Partial<Settings>) {
  settings.value = { ...settings.value, ...patch }
  write('zekr.settings', settings.value)
}

/** The Quran font: "as printed" keeps the printed page's picture; any font sets the page's text in it, in the same frame. */
export function pickFont(v: string) {
  updateSettings(v === 'printed' ? { pageStyle: 'printed' } : { pageStyle: 'text', quranFont: v as QuranFont })
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

/** Quran text as the chosen font can draw it (see fitToFont). */
export const quranText = (text: string): string => fitToFont(text, settings.value.quranFont)
