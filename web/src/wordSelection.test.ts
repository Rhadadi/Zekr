import { describe, expect, it } from 'vitest'
import { wordSegments } from './wordSelection'

describe('word boundaries preserve the displayed spelling', () => {
  it('keeps Arabic marks and prefixes but excludes ornaments and verse numbers', () => {
    expect(wordSegments('وَالَّذِينَ ضَرَبْتُمْ ﴿١٢﴾').map(x => x.text)).toEqual(['وَالَّذِينَ', 'ضَرَبْتُمْ'])
  })
  it('keeps Persian word joins and separates punctuation', () => {
    expect(wordSegments('ایمان، می‌روند.', 'fa').map(x => x.text)).toEqual(['ایمان', 'می‌روند'])
  })
  it('returns UTF-16 offsets into the exact original text', () => {
    const text = '🌙 وَقَالَ: mercy!'
    for (const w of wordSegments(text)) expect(text.slice(w.start, w.end)).toBe(w.text)
  })
})
