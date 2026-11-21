import { describe, it, expect } from 'vitest'
import { describeWord, glossesFor, type WordIndex } from './wordData'
import { SearchEngine, type MorphologyData } from './smartSearch'
const morphology: MorphologyData = { version: 'test', source: 'Invented', roots: ['كتب', 'سلم'], forms: { وكتب: [0], كتابا: [0], يكتب: [0], سليم: [0, 1] }, ayahs: [[0, 1], [0, 1]] }
function index(texts: string[], source = 'ar'): WordIndex { return { texts, morphology: source === 'ar' ? morphology : null, engine: new SearchEngine([{ key: source, texts }], source === 'ar' ? morphology : null) } }
describe('word details', () => {
  it('counts exact forms separately from roots and keeps attested spellings', () => {
    const result = describeWord(index(['وَكَتَبَ سليم وَكَتَبَ', 'يَكْتُبُ سليم']), { text: 'وَكَتَبَ', source: 'ar', language: 'ar' })
    expect(result.occurrences).toBe(2); expect(result.ayahs).toEqual([1]); expect(result.roots).toEqual(['كتب'])
    expect(result.forms.map(f => f.text)).toEqual(['وَكَتَبَ', 'يَكْتُبُ', 'سليم'])
    expect(result.forms.find(f => f.text === 'يَكْتُبُ')?.ayah).toBe(2)
  })
  it('retains ambiguous roots without choosing one', () => {
    const result = describeWord(index(['سليم', 'سليم']), { text: 'سليم', source: 'ar', language: 'ar' })
    expect(result.roots).toEqual(['كتب', 'سلم'])
  })
  it('counts phrases and translation spelling variants without Arabic roots', () => {
    const result = describeWord(index(['ایمان یک ایمان', 'ايمان یک'], 'fa.safavi'), { text: 'ایمان یک', source: 'fa.safavi', language: 'fa' })
    expect(result.occurrences).toBe(2); expect(result.ayahs).toEqual([1, 2]); expect(result.roots).toEqual([]); expect(result.forms).toEqual([])
  })
  it('finds the meaning of a word whose word-by-word entry carries a pause mark or is joined to the next word', () => {
    const wbw: [string, string][] = [['يُبَيِّنُ', 'بیان می‌کند'], ['أَن', 'که'], ['تَضِلُّوا۟ ۗ', 'گمراه شوید'], ['بَعْدَ مَا', 'پس از آنکه']]
    expect(glossesFor(wbw, 'تَضِلُّوا۟')).toEqual(['گمراه شوید'])
    expect(glossesFor(wbw, 'تضلوا')).toEqual(['گمراه شوید'])
    expect(glossesFor(wbw, 'بَعْدَ')).toEqual(['پس از آنکه'])
    expect(glossesFor(wbw, 'كتاب')).toEqual([])
  })
})
