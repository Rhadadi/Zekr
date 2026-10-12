import { describe, expect, it } from 'vitest'
import { fold, highlight, search, tokens } from './search'

describe('fold', () => {
  it('removes diacritics and tatweel', () => {
    expect(fold('بِسْمِ ٱللَّهِ')).toBe('بسم الله')
  })
  it('treats Arabic and Persian yeh/kaf the same', () => {
    expect(fold('كتاب مي')).toBe(fold('کتاب می'))
  })
  it('ignores hamza forms on alef', () => {
    expect(fold('أعوذ')).toBe(fold('اعوذ'))
  })
  it('ignores the zero-width non-joiner', () => {
    expect(fold('می‌رود')).toBe(fold('میرود'))
  })
  it('lowercases English', () => {
    expect(fold('Mercy')).toBe('mercy')
  })
})

describe('search', () => {
  const ar = ['الحمد لله رب العالمين', 'الرحمن الرحيم', 'ملك يوم الدين']
  const en = ['Praise be to Allah', 'The Entirely Merciful, the Especially Merciful', 'Sovereign of the Day of Recompense']

  it('finds Arabic regardless of diacritics', () => {
    const r = search('الرَّحْمَٰنِ', [{ key: 'ar', texts: ar }])
    expect(r.hits).toEqual([{ id: 2, key: 'ar' }])
  })
  it('requires every word', () => {
    expect(search('day recompense', [{ key: 'en', texts: en }]).hits.map((h) => h.id)).toEqual([3])
    expect(search('day mercy', [{ key: 'en', texts: en }]).total).toBe(0)
  })
  it('matches word parts and reports the first matching corpus', () => {
    const r = search('merci', [{ key: 'ar', texts: ar }, { key: 'en', texts: en }])
    expect(r.hits).toEqual([{ id: 2, key: 'en' }])
  })
  it('puts exact phrases first', () => {
    const texts = ['the day of judgement is near', 'a day will come of judgement', 'nothing here']
    expect(search('day of judgement', [{ key: 'en', texts }]).hits.map((h) => h.id)).toEqual([1, 2])
  })
  it('limits results but reports the total', () => {
    const texts = Array.from({ length: 200 }, () => 'mercy')
    const r = search('mercy', [{ key: 'en', texts }], 50)
    expect(r.hits).toHaveLength(50)
    expect(r.total).toBe(200)
  })
  it('ignores an empty query', () => {
    expect(search('  ', [{ key: 'en', texts: en }]).total).toBe(0)
    expect(tokens('  ')).toEqual([])
  })
})

describe('highlight', () => {
  it('marks matching parts, keeping the original text', () => {
    const parts = highlight('Praise be to Allah', 'allah')
    expect(parts).toEqual([{ text: 'Praise be to ', hit: false }, { text: 'Allah', hit: true }])
  })
  it('maps matches through diacritics', () => {
    const parts = highlight('ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', 'الرحيم')
    expect(parts.filter((p) => p.hit).map((p) => p.text.replace(/\s/g, ''))).toEqual(['ٱلرَّحِيمِ'])
  })
})
