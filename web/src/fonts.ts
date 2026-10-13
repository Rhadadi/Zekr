// Arabic fonts for the Quran text. The files are in public/fonts/ (licenses in LICENSES.txt);
// styles.css declares each one, and the browser downloads only the font in use.

export type QuranFont = 'hafs' | 'naskh' | 'meQuran' | 'scheherazade' | 'amiri'

export interface QuranFontInfo {
  id: QuranFont
  /** Name as shown in Settings, the same in both languages (it is the font's name). */
  name: string
  /** CSS font-family declared in styles.css. */
  family: string
}

export const QURAN_FONTS: readonly QuranFontInfo[] = [
  { id: 'hafs', name: 'KFGQPC Hafs', family: 'Zekr Hafs' },
  { id: 'naskh', name: 'KFGQPC Naskh', family: 'Zekr Naskh' },
  { id: 'meQuran', name: 'Me-Quran', family: 'Zekr Me Quran' },
  { id: 'scheherazade', name: 'Scheherazade', family: 'Zekr Scheherazade' },
  { id: 'amiri', name: 'Amiri Quran', family: 'Zekr Amiri' },
]

export const DEFAULT_QURAN_FONT: QuranFont = 'hafs'

export function quranFontInfo(id: string): QuranFontInfo {
  return QURAN_FONTS.find((f) => f.id === id) ?? (QURAN_FONTS[0] as QuranFontInfo)
}

/** The font-family list for a font: the font, then KFGQPC Hafs for any mark it lacks, then system Arabic fonts. */
export function quranFontStack(id: string): string {
  const { family } = quranFontInfo(id)
  const fallback = family === 'Zekr Hafs' ? [] : ["'Zekr Hafs'"]
  return [`'${family}'`, ...fallback, "'Geeza Pro'", "'Noto Naskh Arabic'", 'serif'].join(', ')
}
