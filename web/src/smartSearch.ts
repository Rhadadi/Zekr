import { fold, type Corpus } from './search'

export interface MorphologyData {
  version: string
  source: string
  roots: string[]
  forms: Record<string, number[]>
  ayahs: number[][]
}
export type SearchMode = 'smart' | 'exact' | 'root'
export interface SearchHit {
  id: number
  key: string
  match: 'phrase' | 'text' | 'root'
  roots: string[]
  words: string[]
  score: number
}
export interface SearchResult {
  hits: SearchHit[]
  total: number
  roots: string[]
  suggestions: string[]
}
interface Field {
  key: string
  texts: string[]
  lengths: number[]
  average: number
  postings: Map<string, Map<number, number>>
}
const words = (text: string) => fold(text).match(/[\p{L}\p{N}]+/gu) ?? []
const isArabic = (text: string) => /[\u0621-\u06ff]/u.test(text)

function index(corpus: Corpus): Field {
  const postings = new Map<string, Map<number, number>>()
  const lengths: number[] = []
  const texts = corpus.texts.map((text, i) => {
    const terms = words(text)
    lengths.push(terms.length)
    for (const term of terms) {
      let docs = postings.get(term)
      if (!docs) { docs = new Map(); postings.set(term, docs) }
      docs.set(i + 1, (docs.get(i + 1) ?? 0) + 1)
    }
    return terms.join(' ')
  })
  return { key: corpus.key, texts, lengths, average: Math.max(1, lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length)), postings }
}

/** Bounded edit distance, including a swapped pair of neighbouring letters. */
function distance(a: string, b: string, bound: number): number {
  if (Math.abs(a.length - b.length) > bound) return bound + 1
  let before: number[] = []
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      let n = Math.min(row[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) n = Math.min(n, before[j - 2]! + 1)
      row.push(n)
    }
    if (Math.min(...row) > bound) return bound + 1
    before = prev; prev = row
  }
  return prev[b.length]!
}

/** An inverted index with BM25 ranking; roots come from corpus annotations, not guessed affixes. */
export class SearchEngine {
  private fields: Field[]
  private rootAyahs = new Map<number, Set<number>>()
  private vocabulary = new Map<string, number>()
  constructor(corpora: Corpus[], private morphology?: MorphologyData | null) {
    this.fields = corpora.map(index)
    for (const field of this.fields) for (const [term, docs] of field.postings) this.vocabulary.set(term, (this.vocabulary.get(term) ?? 0) + docs.size)
    morphology?.ayahs.forEach((roots, i) => {
      for (const root of roots) {
        let docs = this.rootAyahs.get(root)
        if (!docs) { docs = new Set(); this.rootAyahs.set(root, docs) }
        docs.add(i + 1)
      }
    })
  }
  private rootsFor(term: string): number[] {
    const forms = this.morphology?.forms
    return forms && Object.prototype.hasOwnProperty.call(forms, term) ? forms[term]! : []
  }
  search(input: string, options: { mode?: SearchMode; first?: number; last?: number; limit?: number } = {}): SearchResult {
    const explicitRoot = /^(?:root|ریشه|جذر)\s*:/iu.test(input.trim())
    const query = input.trim().replace(/^(?:root|ریشه|جذر)\s*:/iu, '')
    const mode = explicitRoot ? 'root' : options.mode ?? 'smart'
    const terms = mode === 'root' ? [words(query).join('')] : [...new Set(words(query))]
    const empty: SearchResult = { hits: [], total: 0, roots: [], suggestions: [] }
    if (!terms.length || !terms[0]) return empty
    const phrases = mode === 'exact' ? [words(query).join(' ')] : Array.from(query.matchAll(/"([^"]+)"|«([^»]+)»|“([^”]+)”/gu), m => words(m[1] ?? m[2] ?? m[3]!).join(' '))
    const termRoots = terms.map(term => mode === 'exact' ? [] : this.rootsFor(term))
    const rootIds = new Set(termRoots.flat())
    const rootNames = [...rootIds].map(id => this.morphology!.roots[id]!)
    const best = new Map<number, SearchHit>()
    for (const field of this.fields) {
      if (mode === 'root' && field.key !== 'ar') continue
      const clauses = terms.map((term, k) => {
        const matches = new Map<number, { score: number; text: boolean }>()
        if (mode !== 'root') {
          const candidates = [term]
          if (mode === 'smart' && term.length >= 3) {
            for (const word of field.postings.keys()) {
              if (word !== term && word.includes(term)) candidates.push(word)
              if (candidates.length >= 100) break
            }
          }
          for (const word of candidates) {
            const docs = field.postings.get(word)
            if (!docs) continue
            const idf = Math.log(1 + (field.texts.length - docs.size + .5) / (docs.size + .5))
            for (const [id, frequency] of docs) {
              const score = idf * frequency * 2.2 / (frequency + 1.2 * (.25 + .75 * field.lengths[id - 1]! / field.average))
              if (!matches.has(id) || matches.get(id)!.score < score) matches.set(id, { score, text: true })
            }
          }
        }
        if (field.key === 'ar' && mode !== 'exact') for (const root of termRoots[k]!) {
          const docs = this.rootAyahs.get(root)
          if (!docs) continue
          const score = Math.log(1 + field.texts.length / docs.size) * .3
          for (const id of docs) if (!matches.has(id)) matches.set(id, { score, text: false })
        }
        return matches
      })
      const smallest = clauses.reduce((a, b) => a.size < b.size ? a : b)
      for (const id of smallest.keys()) {
        if (id < (options.first ?? 1) || id > (options.last ?? Infinity) || !clauses.every(clause => clause.has(id))) continue
        const text = field.texts[id - 1]!
        if (!phrases.every(phrase => (` ${text} `).includes(` ${phrase} `))) continue
        const direct = clauses.every(clause => clause.get(id)!.text)
        const phrase = (` ${text} `).includes(` ${terms.join(' ')} `)
        const match = mode === 'root' || !direct ? 'root' : phrase ? 'phrase' : 'text'
        const score = (match === 'phrase' ? 3000 : match === 'text' ? 2000 : 1000) + clauses.reduce((sum, clause) => sum + clause.get(id)!.score, 0)
        if (best.has(id) && best.get(id)!.score >= score) continue
        const matchingRoots = field.key === 'ar' ? [...rootIds].filter(root => this.rootAyahs.get(root)?.has(id)) : []
        const matchedWords = field.key === 'ar' ? words(text).filter(word => terms.some(term => word.includes(term)) || this.rootsFor(word).some(root => matchingRoots.includes(root))) : []
        best.set(id, { id, key: field.key, match, score, words: [...new Set(matchedWords)], roots: matchingRoots.map(root => this.morphology!.roots[root]!) })
      }
    }
    const hits = [...best.values()].sort((a, b) => b.score - a.score || a.id - b.id)
    return { hits: hits.slice(0, options.limit ?? 60), total: hits.length, roots: rootNames, suggestions: !hits.length && mode === 'smart' && !phrases.length ? this.suggest(terms) : [] }
  }
  private suggest(terms: string[]): string[] {
    if (terms.length > 4) return []
    const unknown = terms.findIndex(term => !this.vocabulary.has(term) && !this.rootsFor(term).length)
    if (unknown < 0 || terms[unknown]!.length < 3) return []
    const term = terms[unknown]!
    const bound = term.length >= 7 ? 2 : 1
    const candidates: { word: string; distance: number; frequency: number }[] = []
    for (const [word, frequency] of this.vocabulary) {
      if (isArabic(word) !== isArabic(term)) continue
      const d = distance(term, word, bound)
      if (d <= bound) candidates.push({ word, distance: d, frequency })
    }
    return candidates.sort((a, b) => a.distance - b.distance || b.frequency - a.frequency || a.word.localeCompare(b.word)).slice(0, 3)
      .map(({ word }) => terms.map((value, i) => i === unknown ? word : value).join(' '))
  }
}
