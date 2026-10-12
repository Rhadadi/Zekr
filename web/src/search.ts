// Search over the Arabic text and translations, entirely in the browser.

const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭ࣓-ࣿـ‌‍‎‏]/g
const LETTERS: Record<string, string> = {
  أ: 'ا', إ: 'ا', آ: 'ا', ٱ: 'ا',
  ى: 'ي', ی: 'ي', ئ: 'ي',
  ک: 'ك', ة: 'ه', ؤ: 'و',
}

/** Fold Arabic/Persian spelling variants together so ي/ی, ك/ک, hamza forms and diacritics don't matter. */
export function fold(text: string): string {
  return text
    .normalize('NFKC')
    .replace(MARKS, '')
    .replace(/[أإآٱىیئکةؤ]/g, (c) => LETTERS[c] as string)
    .toLowerCase()
}

/** Like fold, but also returns for each folded character the index it came from in `text`. */
export function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = ''
  const map: number[] = []
  let i = 0
  for (const ch of text) {
    const f = fold(ch)
    for (const c of f) {
      folded += c
      map.push(i)
    }
    i += ch.length
  }
  return { folded, map }
}

export interface Corpus {
  key: string
  texts: string[]
}

export interface Hit {
  /** Global ayah id. */
  id: number
  /** Which corpus matched first. */
  key: string
}

const foldedCache = new WeakMap<string[], string[]>()

function foldedTexts(texts: string[]): string[] {
  let f = foldedCache.get(texts)
  if (!f) {
    f = texts.map(fold)
    foldedCache.set(texts, f)
  }
  return f
}

export function tokens(query: string): string[] {
  return fold(query).split(/[\s،,.؛;:!?؟"'«»()[\]]+/).filter(Boolean)
}

/** Ayahs where every word of the query appears (as a word part) in at least one corpus. Exact phrase matches come first. */
export function search(query: string, corpora: Corpus[], limit = 80): { hits: Hit[]; total: number } {
  const toks = tokens(query)
  if (toks.length === 0) return { hits: [], total: 0 }
  const phrase = toks.join(' ')
  const phraseHits: Hit[] = []
  const andHits: Hit[] = []
  const seen = new Set<number>()
  for (const corpus of corpora) {
    const folded = foldedTexts(corpus.texts)
    for (let i = 0; i < folded.length; i++) {
      const id = i + 1
      if (seen.has(id)) continue
      const f = folded[i] as string
      if (!toks.every((tok) => f.includes(tok))) continue
      seen.add(id)
      ;(toks.length > 1 && f.includes(phrase) ? phraseHits : andHits).push({ id, key: corpus.key })
    }
  }
  const all = [...phraseHits.sort((a, b) => a.id - b.id), ...andHits.sort((a, b) => a.id - b.id)]
  return { hits: all.slice(0, limit), total: all.length }
}

/** Split `text` into pieces, marking the parts that match a query word. */
export function highlight(text: string, query: string): { text: string; hit: boolean }[] {
  const toks = tokens(query)
  if (toks.length === 0) return [{ text, hit: false }]
  const { folded, map } = foldWithMap(text)
  const marked = new Array<boolean>(folded.length).fill(false)
  for (const tok of toks) {
    for (let at = folded.indexOf(tok); at !== -1; at = folded.indexOf(tok, at + 1)) {
      for (let k = at; k < at + tok.length; k++) marked[k] = true
    }
  }
  const hitChars = new Set<number>()
  marked.forEach((m, k) => {
    if (m) hitChars.add(map[k] as number)
  })
  const contributes = new Set(map)
  const out: { text: string; hit: boolean }[] = []
  let i = 0
  let prevHit = false
  for (const ch of text) {
    // Marks that fold away (diacritics, joiners) take the state of the letter before them.
    const hit: boolean = contributes.has(i) ? hitChars.has(i) : prevHit
    const last = out[out.length - 1]
    if (last && last.hit === hit) last.text += ch
    else out.push({ text: ch, hit })
    prevHit = hit
    i += ch.length
  }
  return out
}
