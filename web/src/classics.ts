// The classical tafsirs (Tabari, Razi, Ibn Kathir ...), one text per ayah, in data/classics/ (tools/classical_tafsir.py).
// Each book's texts are cut into small gzipped chunks; the index says where each surah's chunks start.
import { signal } from '@preact/signals'
import { loadMeta } from './data'

export interface ClassicBook {
  id: string
  lang: 'ar' | 'fa' | 'en'
  name: { en: string; fa: string }
  author: { en: string; fa: string }
  /** where this book's text is from, when not the index's source */
  source?: string
  /** For each surah the book has text for: the first ayah of each of its chunks. */
  chunks: Record<string, number[]>
}

export interface ClassicsIndex {
  source: string
  books: ClassicBook[]
}

const base = import.meta.env.BASE_URL

/** null until checked; false when this build has none. */
export const classicsIndex = signal<ClassicsIndex | false | null>(null)

/** The book the reader chose last (kept on this device). */
const BOOK_KEY = 'zekr.classicBook'
export const classicBook = signal<string>(((): string => {
  try { return localStorage.getItem(BOOK_KEY) ?? '' } catch { return '' }
})())
export function chooseClassicBook(id: string) {
  classicBook.value = id
  try { localStorage.setItem(BOOK_KEY, id) } catch { /* not kept */ }
}

/** What the Tafsir tab beside an ayah shows: Al-Mizan (until the reader picks something else), the classical book
 * chosen above, or the Study Quran. Kept on this device. */
export type TafsirPick = 'almizan' | 'classic' | 'study'
const PICK_KEY = 'zekr.tafsirPick'
export const tafsirPick = signal<TafsirPick>(((): TafsirPick => {
  try {
    const v = localStorage.getItem(PICK_KEY)
    return v === 'classic' || v === 'study' ? v : 'almizan'
  } catch { return 'almizan' }
})())
export function chooseTafsirPick(v: TafsirPick) {
  tafsirPick.value = v
  try { localStorage.setItem(PICK_KEY, v) } catch { /* not kept */ }
}

let checking: Promise<ClassicsIndex | false> | null = null

export function checkClassics(): Promise<ClassicsIndex | false> {
  checking ??= loadMeta()
    .then(async (meta) => {
      if (!meta.classics?.length) return false as const
      const res = await fetch(`${base}data/classics/index.json?v=${meta.version}`)
      if (!res.ok) return false as const
      return (await res.json()) as ClassicsIndex
    })
    .catch(() => false as const)
    .then((v) => {
      classicsIndex.value = v
      return v
    })
  return checking
}

/** The books that have something on this surah, in the index's order. */
export const booksFor = (index: ClassicsIndex, surah: number) => index.books.filter((b) => b.chunks[String(surah)]?.length)

/** The chunk that holds `ayah`: its number (1-based) among the surah's chunks. */
export function chunkNumber(book: ClassicBook, surah: number, ayah: number): number | undefined {
  const starts = book.chunks[String(surah)]
  if (!starts?.length) return undefined
  let k = 0
  starts.forEach((s, i) => { if (s <= ayah) k = i })
  return k + 1
}

type Chunk = Record<string, string | number>
const chunks = new Map<string, Promise<Chunk>>()

/** GitHub Pages sends the file as it is (gzip); a server that marks it Content-Encoding: gzip has the browser unpack it. */
async function unpack(res: Response): Promise<Chunk> {
  const bytes = new Uint8Array(await res.arrayBuffer())
  const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b
  const text = await new Response(gzip ? new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')) : bytes).text()
  return JSON.parse(text) as Chunk
}

/** What the book says on the ayah, or null where it has nothing on it. */
export async function loadClassic(book: ClassicBook, surah: number, ayah: number): Promise<string | null> {
  return (await loadClassicRange(book, surah, ayah))?.text ?? null
}

/** The same, with the ayahs the text is about: an author who discusses several together has one text for them all. */
export async function loadClassicRange(book: ClassicBook, surah: number, ayah: number): Promise<{ text: string; from: number; to: number } | null> {
  const k = chunkNumber(book, surah, ayah)
  if (!k) return null
  const meta = await loadMeta()
  const url = `${base}data/classics/${book.id}/${surah}-${k}.json.gz?v=${meta.version}`
  let chunk = chunks.get(url)
  if (!chunk) {
    chunk = fetch(url).then((res) => {
      if (!res.ok) throw new Error(`Could not load ${book.id} ${surah}:${ayah} (${res.status})`)
      return unpack(res)
    })
    chunk.catch(() => chunks.delete(url)) // try again next time
    chunks.set(url, chunk)
  }
  const rows = await chunk
  const value = rows[String(ayah)]
  // an ayah the author discusses with its neighbours has the number of the ayah that holds the text
  const from = typeof value === 'number' ? value : ayah
  const text = typeof value === 'number' ? (rows[String(value)] as string | undefined) : value
  if (!text) return null
  let to = from
  while (rows[String(to + 1)] === from) to++
  return { text, from, to }
}
