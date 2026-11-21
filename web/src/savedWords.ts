import { signal } from '@preact/signals'
import type { WordSelection } from './wordSelection'
export type SavedWord = Pick<WordSelection, 'text' | 'source' | 'language' | 'ayah'>
export const wordKey = (word: SavedWord) => JSON.stringify([word.source, word.ayah, word.text])
export function validSavedWords(value: unknown): SavedWord[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.filter((w): w is SavedWord => {
    if (!w || typeof w !== 'object' || typeof w.text !== 'string' || !w.text.trim() || w.text.length > 240 || !Number.isInteger(w.ayah) || w.ayah < 1 || w.ayah > 6236 || typeof w.source !== 'string' || !/^[a-z][a-z0-9_.-]{0,79}$/i.test(w.source) || !['ar', 'fa', 'en'].includes(w.language)) return false
    const key = wordKey(w)
    if (seen.has(key)) return false
    seen.add(key); return true
  }).map(({ text, source, language, ayah }) => ({ text, source, language, ayah }))
}
function read(): SavedWord[] { try { return validSavedWords(JSON.parse(localStorage.getItem('zekr.words') ?? '[]')) } catch { return [] } }
export const savedWords = signal<SavedWord[]>(read())
export const isWordSaved = (word: SavedWord) => savedWords.value.some(w => wordKey(w) === wordKey(word))
export function toggleSavedWord(word: SavedWord) {
  const list = isWordSaved(word) ? savedWords.value.filter(w => wordKey(w) !== wordKey(word)) : [...savedWords.value, ...validSavedWords([word])]
  // Persist first: storage failure must not show a false “saved” state.
  localStorage.setItem('zekr.words', JSON.stringify(list))
  savedWords.value = list
}
