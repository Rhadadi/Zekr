import { describe, expect, it } from 'vitest'
import { afterEnded, hasBasmalaBefore, skipNext, skipPrevious, startCursor, type Cursor, type Plan } from './playback'
import { audioUrl, audioTranslations, reciters } from './reciters'

const plan = (over: Partial<Plan> = {}): Plan => ({ end: 3, repeat: 1, translation: false, ...over })

function run(start: Cursor, p: Plan): Cursor[] {
  const seq = [start]
  for (let c = afterEnded(start, p); c; c = afterEnded(c, p)) {
    seq.push(c)
    if (seq.length > 100) throw new Error('did not stop')
  }
  return seq
}

describe('playback order', () => {
  it('plays ayahs in order up to the end', () => {
    const seq = run({ ayahId: 1, phase: 'ayah', repeatLeft: 1 }, plan())
    expect(seq.map((c) => c.ayahId)).toEqual([1, 2, 3])
  })

  it('repeats each ayah', () => {
    const seq = run({ ayahId: 1, phase: 'ayah', repeatLeft: 2 }, plan({ end: 2, repeat: 2 }))
    expect(seq.map((c) => c.ayahId)).toEqual([1, 1, 2, 2])
  })

  it('plays the translation recording after each ayah, before repeating', () => {
    const seq = run({ ayahId: 5, phase: 'ayah', repeatLeft: 2 }, plan({ end: 6, repeat: 2, translation: true }))
    expect(seq.map((c) => `${c.ayahId}${c.phase[0]}`)).toEqual(['5a', '5t', '5a', '5t', '6a', '6t', '6a', '6t'])
  })

  it('plays the basmala first, once', () => {
    const start = startCursor(8, 2, 1, plan({ end: 9, repeat: 2 }), true)
    expect(start.phase).toBe('basmala')
    const seq = run(start, plan({ end: 9, repeat: 2 }))
    expect(seq.map((c) => c.phase[0])).toEqual(['b', 'a', 'a', 'a', 'a'])
  })

  it('stops at a single ayah', () => {
    expect(run({ ayahId: 7, phase: 'ayah', repeatLeft: 1 }, plan({ end: 7 }))).toHaveLength(1)
  })
})

describe('basmala rule', () => {
  it('is before the first ayah of surahs other than 1 and 9', () => {
    expect(hasBasmalaBefore(1, 1)).toBe(false)
    expect(hasBasmalaBefore(9, 1)).toBe(false)
    expect(hasBasmalaBefore(2, 1)).toBe(true)
    expect(hasBasmalaBefore(2, 2)).toBe(false)
  })
  it('can be turned off', () => {
    expect(startCursor(8, 2, 1, plan(), false).phase).toBe('ayah')
  })
})

describe('skipping', () => {
  it('goes to the neighbouring ayah and respects the limits', () => {
    const c: Cursor = { ayahId: 10, phase: 'translation', repeatLeft: 1 }
    expect(skipNext(c, plan(), 6236)?.ayahId).toBe(11)
    expect(skipPrevious(c, plan())?.phase).toBe('ayah')
    expect(skipNext({ ...c, ayahId: 6236 }, plan(), 6236)).toBeNull()
    expect(skipPrevious({ ...c, ayahId: 1 }, plan())).toBeNull()
  })
})

describe('audio urls', () => {
  it('pads surah and ayah to three digits', () => {
    expect(audioUrl('Minshawy_Murattal_128kbps', 17, 24)).toBe('https://everyayah.com/data/Minshawy_Murattal_128kbps/017024.mp3')
    expect(audioUrl('x', 114, 6)).toBe('https://everyayah.com/data/x/114006.mp3')
    expect(audioUrl('x', 1, 1)).toBe('https://everyayah.com/data/x/001001.mp3')
  })
  it('has unique ids', () => {
    expect(new Set(reciters.map((r) => r.id)).size).toBe(reciters.length)
    expect(new Set(audioTranslations.map((r) => r.id)).size).toBe(audioTranslations.length)
  })
})
