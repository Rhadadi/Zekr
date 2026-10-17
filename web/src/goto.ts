// "Go to…": a surah, an ayah (2:255), a page or a juz, typed in any of the languages and digits the app knows.
import { type Meta, type Surah, pageOf } from './data'
import { fold } from './search'

export interface Target {
  kind: 'surah' | 'ayah' | 'page' | 'juz'
  surah?: number
  ayah?: number
  /** The page (for a page, or the page a juz starts on) or the juz number. */
  page?: number
  juz?: number
}

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩'
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹'
/** Arabic-Indic and Persian digits as plain ones. */
export const asciiDigits = (s: string) => s.replace(/[٠-٩۰-۹]/g, (d) => String(Math.max(ARABIC_INDIC.indexOf(d), PERSIAN.indexOf(d))))
/** Names compared without spaces, hyphens, apostrophes or spelling variants. */
const key = (s: string) => fold(s).replace(/[\s\-'’ʼʻ`.]+/g, '')

const PAGE_WORDS = /^(?:page|p|ص|صفحه|صفحة|صفحهٔ)\s*(\d+)$/
const JUZ_WORDS = /^(?:juz|جزء|جز|پاره)\s*(\d+)$/

const surahTarget = (s: Surah): Target => ({ kind: 'surah', surah: s.id })
const ayahTarget = (s: Surah, ayah: number): Target => ({ kind: 'ayah', surah: s.id, ayah })

/** Up to eight places the text may mean, best first. */
export function gotoTargets(meta: Meta, input: string): Target[] {
  const text = asciiDigits(input.trim()).replace(/\s+/g, ' ')
  if (!text) return []
  const out: Target[] = []
  const surah = (n: number) => meta.surahs[n - 1]
  const page = (n: number) => (n >= 1 && n <= 604 ? out.push({ kind: 'page', page: n }) : 0)
  const juz = (n: number) => {
    const m = meta.juz[n - 1]
    if (m) out.push({ kind: 'juz', juz: n, page: pageOf(meta, m.id) })
  }

  // 2:255 (also 2/255, 2.255, 2 255 with a colon-like mark)
  const ref = /^(\d{1,3})\s*[:/.،٫-]\s*(\d{1,3})$/.exec(text)
  if (ref) {
    const s = surah(Number(ref[1]))
    const a = Number(ref[2])
    return s && a >= 1 && a <= s.ayahs ? [ayahTarget(s, a)] : []
  }
  if (/^\d{1,3}$/.test(text)) {
    const n = Number(text)
    const s = surah(n)
    if (s) out.push(surahTarget(s))
    page(n)
    juz(n)
    return out
  }
  const p = PAGE_WORDS.exec(fold(text))
  if (p) {
    page(Number(p[1]))
    return out
  }
  const j = JUZ_WORDS.exec(fold(text))
  if (j) {
    juz(Number(j[1]))
    return out
  }
  // a surah by name, with an ayah after it ("baqara 255")
  const withAyah = /^(.*\D)\s+(\d{1,3})$/.exec(text)
  const name = key(withAyah ? withAyah[1]! : text)
  if (!name) return []
  const rank = (s: Surah) => {
    const names = [s.tr, s.en, s.fa, s.ar].map(key)
    if (names.some((n) => n === name)) return 0
    if (names.some((n) => n.startsWith(name))) return 1
    return names.some((n) => n.includes(name)) ? 2 : 3
  }
  const found = meta.surahs.map((s) => ({ s, r: rank(s) })).filter((x) => x.r < 3).sort((a, b) => a.r - b.r || a.s.id - b.s.id)
  for (const { s } of found.slice(0, 8)) {
    const a = withAyah ? Number(withAyah[2]) : 0
    out.push(a >= 1 && a <= s.ayahs ? ayahTarget(s, a) : surahTarget(s))
  }
  return out
}
