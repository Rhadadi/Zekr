import { describe, expect, it } from 'vitest'
import { highlight } from './search'
import { SearchEngine, type MorphologyData } from './smartSearch'

const ar = ['إذا ضربتم في الأرض', 'أن يضرب مثلا', 'كتاب كتبناه', 'كتب عليكم الصيام', 'ضربتم']
const en = ['Travel in the land', 'He sets an example', 'A book of mercy', 'Fasting is prescribed', 'You travelled']
const fa = ['سفر کردید', 'مثال می‌زند', 'کتابی برای مردم', 'روزه مقرر شد', 'شما سفر کردید']
const morphology: MorphologyData = {
  version: 'test', source: 'test', roots: ['ضرب', 'كتب'],
  forms: { ضرب: [0], ضربتم: [0], يضرب: [0], كتب: [1], كتاب: [1], كتبناه: [1] },
  ayahs: [[0], [0], [1], [1], [0]],
}
const engine = new SearchEngine([{ key: 'ar', texts: ar }, { key: 'en.sahih', texts: en }, { key: 'fa.safavi', texts: fa }], morphology)

describe('smart search', () => {
  it('ranks direct text before annotated inflections and labels related matches', () => {
    const result = engine.search('ضربتم')
    expect(result.roots).toEqual(['ضرب'])
    expect(new Set(result.hits.slice(0, 2).map(hit => hit.id))).toEqual(new Set([1, 5]))
    expect(result.hits[2]).toMatchObject({ id: 2, match: 'root', roots: ['ضرب'], words: ['يضرب'] })
    const marked = highlight('أَن يَضْرِبَ مَثَلًا', result.hits[2]!.words.join(' '))
    expect(marked.filter(part => part.hit).map(part => part.text).join('')).toBe('يَضْرِبَ')
    expect(marked.map(part => part.text).join('')).toBe('أَن يَضْرِبَ مَثَلًا')
  })
  it('treats Persian and Arabic keyboards, marks and joiners equally', () => {
    expect(engine.search('کِتاب').hits).toEqual(engine.search('كتاب').hits)
    expect(engine.search('میزند').hits.map(hit => hit.id)).toEqual([2])
  })
  it('keeps quoted phrases and Exact phrase mode literal', () => {
    expect(engine.search('«ضربتم في»').hits.map(hit => hit.id)).toEqual([1])
    expect(new Set(engine.search('ضربتم', { mode: 'exact' }).hits.map(hit => hit.id))).toEqual(new Set([1, 5]))
    expect(engine.search('ضربتم الأرض', { mode: 'exact' }).total).toBe(0)
  })
  it('accepts explicit roots and combines terms with AND', () => {
    expect(engine.search('root:ض ر ب').hits.map(hit => hit.id).sort()).toEqual([1, 2, 5])
    expect(engine.search('ضربتم مثلا').hits.map(hit => hit.id)).toEqual([2])
  })
  it('filters before limiting and retains the full result count', () => {
    expect(engine.search('ضرب', { first: 2, last: 2 }).hits.map(hit => hit.id)).toEqual([2])
    const result = engine.search('ضرب', { limit: 1 })
    expect(result.hits).toHaveLength(1)
    expect(result.total).toBe(3)
  })
  it('offers spelling corrections without silently changing the query', () => {
    const result = engine.search('mercu')
    expect(result.total).toBe(0)
    expect(result.suggestions).toContain('mercy')
    expect(engine.search('mercu', { mode: 'exact' }).suggestions).toEqual([])
  })
  it('identifies the translation that actually matched', () => {
    expect(engine.search('prescribed').hits[0]).toMatchObject({ id: 4, key: 'en.sahih' })
  })
  it('keeps text search available without the optional morphology file', () => {
    const plain = new SearchEngine([{ key: 'ar', texts: ar }])
    expect(plain.search('ضربتم').total).toBe(2)
    expect(plain.search('constructor').hits).toEqual([])
    expect(plain.search('«»').hits).toEqual([])
  })
  it('resolves final-alif spellings through attested weak-root forms, without unrelated substring matches', () => {
    const variants = new SearchEngine([
      { key: 'ar', texts: ['الزنى', 'الزاني', 'يزنون', 'الربوا', 'ربي', 'زنان'] },
      { key: 'fa.safavi', texts: ['زنا', '', '', '', '', 'زنان'] },
    ], {
      version: 'test', source: 'test', roots: ['زني', 'ربو', 'ربب'],
      forms: { زني: [0], الزني: [0], الزاني: [0], يزنون: [0], الربوا: [1], ربي: [1, 2] },
      ayahs: [[0], [0], [0], [1], [2], []],
    })
    expect(variants.search('زنا').hits.map(hit => hit.id).sort()).toEqual([1, 2, 3])
    expect(variants.search('زنا').roots).toEqual(['زني'])
    expect(variants.search('زنا').hits.find(hit => hit.id === 1)?.words).toContain('الزني')
    expect(variants.search('الزنا', { mode: 'root' }).hits.map(hit => hit.id).sort()).toEqual([1, 2, 3])
    expect(variants.search('زنی', { mode: 'root' }).total).toBe(3)
    expect(variants.search('الربا', { mode: 'root' }).hits.map(hit => hit.id)).toEqual([4])
    expect(variants.search('ربا', { mode: 'root' }).roots).toEqual(['ربو'])
    expect(variants.search('زنا', { mode: 'exact' }).hits.map(hit => hit.id)).toEqual([1])
    expect(variants.search('زنان').hits.map(hit => hit.id)).toEqual([6])
    expect(highlight('زنان، زنا', 'زنا', true).filter(part => part.hit).map(part => part.text)).toEqual(['زنا'])
  })
})
