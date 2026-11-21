import { type Meta, loadMorphology, loadText, loadTranslation, loadWbw, locate } from './data'
import { fold } from './search'
import { SearchEngine, type MorphologyData } from './smartSearch'
import { wordSegments, type WordSelection } from './wordSelection'

export interface WordIndex { texts: string[]; engine: SearchEngine; morphology: MorphologyData | null }
export interface WordDetails {
  occurrences: number
  ayahs: number[]
  roots: string[]
  forms: { text: string; roots: string[]; ayah: number }[]
  glosses: string[]
  glossUnavailable: boolean
}
const cache = new Map<string, Promise<WordIndex>>()
export function loadWordIndex(meta: Meta, source: string): Promise<WordIndex> {
  const key = `${meta.version}:${source}`
  let promise = cache.get(key)
  if (!promise) {
    promise = Promise.all([source === 'ar' ? loadText('uthmani') : loadTranslation(source), source === 'ar' && meta.morphology ? loadMorphology() : null])
      .then(([texts, morphology]) => ({ texts, morphology, engine: new SearchEngine([{ key: source, texts }], morphology) }))
      .catch(error => { cache.delete(key); throw error })
    cache.set(key, promise)
  }
  return promise
}

/** Count the displayed form, not every word that might share one of its roots. */
export function describeWord(index: WordIndex, word: Pick<WordSelection, 'text' | 'source' | 'language'>): WordDetails {
  const query = wordSegments(word.text, word.language).map(w => fold(w.text)).join(' ')
  let occurrences = 0
  const ayahs: number[] = []
  const spellings = new Map<string, { text: string; ayah: number }>()
  index.texts.forEach((text, i) => {
    const segments = wordSegments(text, word.language)
    for (const token of segments) if (!spellings.has(fold(token.text))) spellings.set(fold(token.text), { text: token.text, ayah: i + 1 })
    const tokens = segments.map(w => fold(w.text))
    const needle = query.split(' ')
    let count = 0
    if (query) for (let at = 0; at <= tokens.length - needle.length; at++) if (needle.every((t, j) => tokens[at + j] === t)) count++
    if (count) { occurrences += count; ayahs.push(i + 1) }
  })
  const roots = word.source === 'ar' && wordSegments(word.text).length === 1 ? index.engine.search(word.text, { mode: 'root', limit: 0 }).roots : []
  const rootIds = new Set(roots.map(root => index.morphology!.roots.indexOf(root)))
  const forms = Object.entries(index.morphology?.forms ?? {}).filter(([form, ids]) => spellings.has(form) && ids.some(id => rootIds.has(id)))
    .map(([form, ids]) => ({ ...spellings.get(form)!, roots: ids.filter(id => rootIds.has(id)).map(id => index.morphology!.roots[id]!) }))
  return { occurrences, ayahs, roots, forms, glosses: [], glossUnavailable: false }
}

/** The word-by-word meanings of an ayah's word. The word-by-word list keeps the pause marks after a space ("رَيْبَ ۛ")
 * and joins a few pairs into one entry ("بَعْدَ مَا"): compare without spaces, then within such a pair. */
export function glossesFor(words: [string, string][], text: string): string[] {
  const key = (s: string) => fold(s).replace(/\s+/g, '')
  const want = key(text)
  if (!want) return []
  let hits = words.filter(([ar]) => key(ar) === want)
  if (!hits.length) hits = words.filter(([ar]) => wordSegments(ar).some(w => key(w.text) === want))
  return [...new Set(hits.map(([, fa]) => fa).filter(Boolean))]
}

const detailsCache = new Map<string, Promise<WordDetails>>()
export function loadWordDetails(meta: Meta, word: WordSelection, refresh = false): Promise<WordDetails> {
  const key = `${meta.version}:${word.source}:${word.ayah}:${word.text}`
  if (refresh) detailsCache.delete(key)
  let promise = detailsCache.get(key)
  if (!promise) {
    promise = loadWordIndex(meta, word.source).then(async index => {
      const result = describeWord(index, word)
      if (word.source === 'ar' && meta.wbw && wordSegments(word.text).length === 1) {
        const at = locate(meta, word.ayah)
        try {
          result.glosses = glossesFor((await loadWbw(at.surah))[at.ayah - 1] ?? [], word.text)
        } catch { result.glossUnavailable = true; detailsCache.delete(key) }
      }
      return result
    }).catch(error => { detailsCache.delete(key); throw error })
    detailsCache.set(key, promise)
  }
  return promise
}
