// Al-Mizan, when the data was built with `build_data.py --almizan-web` (private builds only; the
// public site never has it, see docs/PLAN.md §8). Format: tools/almizan.py.
import { signal } from '@preact/signals'

export type RunStyle = 'q' | 'e' | 'd'
/** [text], [text, style] or [footnote number, 'n']. */
export type Run = [string] | [string, RunStyle] | [number, 'n']

export interface TafsirBlock {
  /** s = surah heading, h = part (ترجمه آیات, بیان آیات, بحث روایتی ...), t = topic, p = paragraph */
  t: 's' | 'h' | 't' | 'p'
  r: Run[]
}

export interface TafsirSection {
  id: string
  surah: number
  from: number
  to: number
  title: string
  blocks: TafsirBlock[]
  notes: string[]
}

interface TafsirIndex {
  source: string
  /** [section id, first ayah id, last ayah id], in order. */
  sections: [string, number, number][]
}

const base = import.meta.env.BASE_URL

/** null until checked; false when this build has no tafsir. */
export const tafsirIndex = signal<TafsirIndex | false | null>(null)

let checking: Promise<TafsirIndex | false> | null = null

export function checkTafsir(): Promise<TafsirIndex | false> {
  checking ??= fetch(`${base}data/almizan/index.json`)
    .then(async (res) => {
      const type = res.headers.get('content-type') ?? ''
      if (!res.ok || !type.includes('json')) return false as const
      return (await res.json()) as TafsirIndex
    })
    .catch(() => false as const)
    .then((v) => {
      tafsirIndex.value = v
      return v
    })
  return checking
}

/** The id of the section that explains an ayah. */
export function sectionIdFor(index: TafsirIndex, ayahId: number): string | undefined {
  return index.sections.find(([, first, last]) => first <= ayahId && ayahId <= last)?.[0]
}

export async function loadSection(id: string): Promise<TafsirSection> {
  const res = await fetch(`${base}data/almizan/${id}.json`)
  if (!res.ok) throw new Error(`Could not load tafsir ${id} (${res.status})`)
  return (await res.json()) as TafsirSection
}
