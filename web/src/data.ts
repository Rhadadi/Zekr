// Loads the Quran data that tools/build_data.py generates into public/data/.

export interface Surah {
  id: number
  ayahs: number
  /** Global id of the surah's first ayah (ids run 1..6236). */
  first: number
  ar: string
  fa: string
  tr: string
  en: string
  type: 'Meccan' | 'Medinan'
  order: number
}

export interface Marker {
  n: number
  surah: number
  ayah: number
  id: number
}

export interface TranslationInfo {
  id: string
  lang: 'fa' | 'en'
  name: string
  translator: string
  dir: 'rtl' | 'ltr'
  widget: boolean
}

export interface Meta {
  version: string
  basmala: { uthmani: string; simple: string }
  surahs: Surah[]
  juz: Marker[]
  hizbQuarters: Marker[]
  /** Global id of the first ayah on each of the 604 pages. */
  pages: number[]
  sajdas: { surah: number; ayah: number; id: number; type: string }[]
  translations: TranslationInfo[]
}

export interface PoolsFile {
  fit: { arabic_max_letters: number; translation_max_chars: number }
  pools: Record<string, number[]>
}

export type TextKind = 'uthmani' | 'simple' | 'clean'
export type Script = 'uthmani' | 'simple'

export const TOTAL_AYAHS = 6236

const base = import.meta.env.BASE_URL

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}data/${path}`)
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`)
  return (await res.json()) as T
}

let metaPromise: Promise<Meta> | null = null

export function loadMeta(): Promise<Meta> {
  metaPromise ??= getJson<Meta>('meta.json').catch((e) => {
    metaPromise = null
    throw e
  })
  return metaPromise
}

const arrays = new Map<string, Promise<string[]>>()

function loadArray(path: string): Promise<string[]> {
  let p = arrays.get(path)
  if (!p) {
    // The data version is in the URL so the service worker can cache these files forever.
    p = loadMeta()
      .then((m) => getJson<string[]>(`${path}?v=${m.version}`))
      .then((a) => {
        if (a.length !== TOTAL_AYAHS) throw new Error(`${path} has ${a.length} ayahs`)
        return a
      })
      .catch((e) => {
        arrays.delete(path)
        throw e
      })
    arrays.set(path, p)
  }
  return p
}

/** Arabic text, one string per ayah (index = ayah id - 1). */
export const loadText = (kind: TextKind) => loadArray(`text/${kind}.json`)

/** A translation, one string per ayah (index = ayah id - 1). May be '' where the translator merged two ayahs. */
export const loadTranslation = (id: string) => loadArray(`tr/${id}.json`)

let poolsPromise: Promise<PoolsFile> | null = null

export function loadPools(): Promise<PoolsFile> {
  poolsPromise ??= loadMeta()
    .then((m) => getJson<PoolsFile>(`pools.json?v=${m.version}`))
    .catch((e) => {
      poolsPromise = null
      throw e
    })
  return poolsPromise
}

/** Ayah ids a daily/widget rotation can draw from, ascending. */
export async function getPool(name: string): Promise<number[]> {
  if (name === 'all') return Array.from({ length: TOTAL_AYAHS }, (_, i) => i + 1)
  const { pools } = await loadPools()
  return pools[name] ?? getPool('all')
}

/** Fetch every data file so the app works offline. Reports progress as done/total. */
export async function downloadAll(onProgress: (done: number, total: number) => void): Promise<void> {
  const meta = await loadMeta()
  const jobs: (() => Promise<unknown>)[] = [
    () => loadPools(),
    ...(['uthmani', 'simple', 'clean'] as const).map((k) => () => loadText(k)),
    ...meta.translations.map((t) => () => loadTranslation(t.id)),
  ]
  let done = 0
  onProgress(0, jobs.length)
  for (const job of jobs) {
    await job()
    onProgress(++done, jobs.length)
  }
}

export function ayahIdOf(meta: Meta, surah: number, ayah: number): number {
  const s = meta.surahs[surah - 1]
  if (!s || ayah < 1 || ayah > s.ayahs) throw new RangeError(`no ayah ${surah}:${ayah}`)
  return s.first + ayah - 1
}

/** Surah and ayah number for a global ayah id. */
export function locate(meta: Meta, id: number): { surah: number; ayah: number } {
  let lo = 0
  let hi = meta.surahs.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((meta.surahs[mid] as Surah).first <= id) lo = mid
    else hi = mid - 1
  }
  const s = meta.surahs[lo] as Surah
  return { surah: s.id, ayah: id - s.first + 1 }
}

export type PlayTo = 'ayah' | 'page' | 'surah' | 'juz' | 'rub' | 'quran'

/** Last ayah id of the stretch that starts at `id`: the ayah itself, the page, surah, juz, hizb quarter or the Quran. */
export function endOf(meta: Meta, id: number, scope: PlayTo): number {
  const nextStart = (starts: number[]) => starts.find((s) => s > id)
  switch (scope) {
    case 'ayah':
      return id
    case 'quran':
      return TOTAL_AYAHS
    case 'surah': {
      const { surah } = locate(meta, id)
      const s = meta.surahs[surah - 1] as Surah
      return s.first + s.ayahs - 1
    }
    case 'page':
      return (nextStart(meta.pages) ?? TOTAL_AYAHS + 1) - 1
    case 'juz':
      return (nextStart(meta.juz.map((m) => m.id)) ?? TOTAL_AYAHS + 1) - 1
    case 'rub':
      return (nextStart(meta.hizbQuarters.map((m) => m.id)) ?? TOTAL_AYAHS + 1) - 1
  }
}

/** Mushaf page (1-604) that holds an ayah. */
export function pageOf(meta: Meta, id: number): number {
  let lo = 0
  let hi = meta.pages.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((meta.pages[mid] as number) <= id) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

/** First and last ayah id on a page. */
export function pageRange(meta: Meta, page: number): { first: number; last: number } {
  const first = meta.pages[page - 1]
  if (first === undefined) throw new RangeError(`no page ${page}`)
  return { first, last: (meta.pages[page] ?? TOTAL_AYAHS + 1) - 1 }
}

export function juzOf(meta: Meta, id: number): number {
  let n = 1
  for (const m of meta.juz) if (m.id <= id) n = m.n
  return n
}
