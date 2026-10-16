import type { Meta } from './data'

export interface StudyReference {
  raw: string
  target_kind: 'ayah' | 'commentary' | 'introduction'
  target_surah: number
  first_ayah: number | null
  last_ayah: number | null
}
export interface StudyEntry {
  id: string
  surah_id: number
  note_label: string
  first_ayah: number
  last_ayah: number
  coverage_kind: 'explicit_note' | 'quoted_header'
  lemma_text: string
  text: string
  html: string
  ayah_ids: number[]
  pages: number[]
  references: StudyReference[]
  audio?: { file: string; duration: number; voice: string; model: string; sha256: string }
}
export interface StudyTafsir { surah: number; entries: StudyEntry[]; byAyah: Record<string, string[]> }
export interface StudyIntroduction { text: string; html: string; pages: number[] }

const cache = new Map<string, Promise<unknown>>()
function load<T>(meta: Meta, kind: 'intro' | 'tafsir', surah: number, refresh = false): Promise<T> {
  if (!meta.studyQuran) return Promise.reject(new Error('Study Quran content is not installed'))
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) return Promise.reject(new RangeError('Invalid surah'))
  const path = `${kind}/${meta.studyQuran.id}/${surah}.json?v=${meta.version}`
  if (refresh) cache.delete(path)
  let promise = cache.get(path)
  if (!promise) {
    promise = fetch(`${import.meta.env.BASE_URL}data/${path}`).then(async (r) => {
      if (!r.ok) throw new Error(`Could not load The Study Quran (${r.status})`)
      return r.json()
    }).catch((error) => { cache.delete(path); throw error })
    cache.set(path, promise)
  }
  return promise as Promise<T>
}
export const loadStudyTafsir = (meta: Meta, surah: number, refresh = false) => load<StudyTafsir>(meta, 'tafsir', surah, refresh)
export const loadStudyIntroduction = (meta: Meta, surah: number, refresh = false) => load<StudyIntroduction>(meta, 'intro', surah, refresh)

export function entriesForAyah(data: StudyTafsir, ayahID: number): StudyEntry[] {
  const ids = new Set(data.byAyah[String(ayahID)] ?? [])
  return data.entries.filter((entry) => ids.has(entry.id))
}

const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
export function searchStudyEntries(entries: StudyEntry[], query: string, limit = 50) {
  const tokens = fold(query).split(/\s+/).filter(Boolean)
  if (!tokens.length) return { total: 0, entries: [] as StudyEntry[] }
  const found = entries.filter((e) => {
    const text = fold(e.text)
    return tokens.every((t) => text.includes(t))
  })
  return { total: found.length, entries: found.slice(0, limit) }
}

export async function loadAllStudyEntries(meta: Meta): Promise<StudyEntry[]> {
  const chapters = await Promise.all(meta.surahs.map((s) => loadStudyTafsir(meta, s.id)))
  return chapters.flatMap((c) => c.entries)
}
