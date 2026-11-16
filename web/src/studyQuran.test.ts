import { describe, expect, it, vi } from 'vitest'
import { entriesForAyah, loadStudyTafsir, referenceTarget, searchStudyEntries, type StudyEntry, type StudyTafsir } from './studyQuran'
import type { Meta } from './data'

const note = { id: 'shared', text: 'The meaning of tawḥīd and mercy.', ayah_ids: [18, 19] } as StudyEntry
describe('Study Quran content', () => {
  it('returns one shared entry for each covered ayah and does not invent missing notes', () => {
    const data: StudyTafsir = { surah: 2, entries: [note], byAyah: { '18': ['shared'], '19': ['shared'] } }
    expect(entriesForAyah(data,18)).toEqual([note])
    expect(entriesForAyah(data,19)).toEqual([note])
    expect(entriesForAyah(data,20)).toEqual([])
  })
  it('finds transliterated words without changing source text', () => {
    expect(searchStudyEntries([note],'tawhid mercy').entries).toEqual([note])
    expect(note.text).toContain('tawḥīd')
    expect(searchStudyEntries([note],'justice').total).toBe(0)
  })
  it('makes no content request in a normal build', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch',fetch)
    await expect(loadStudyTafsir({ version: 'public' } as Meta,2)).rejects.toThrow('not installed')
    expect(fetch).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
  it('deduplicates chapter loads, retries failures, and separates versions', async () => {
    const data = { surah: 2, entries: [], byAyah: {} }
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({ ok: true, json: async () => data })
    vi.stubGlobal('fetch',fetch)
    const meta = { version: 'test-1', studyQuran: { id: 'study_quran' } } as Meta
    await expect(loadStudyTafsir(meta,2)).rejects.toThrow('503')
    await Promise.all([loadStudyTafsir(meta,2),loadStudyTafsir(meta,2)])
    expect(fetch).toHaveBeenCalledTimes(2)
    await loadStudyTafsir({ ...meta, version: 'test-2' },2)
    expect(fetch).toHaveBeenCalledTimes(3)
    await loadStudyTafsir({ ...meta, version: 'test-2' },2,true)
    expect(fetch).toHaveBeenCalledTimes(4)
    vi.unstubAllGlobals()
  })
})

describe('cross-references in a note', () => {
  const meta = { surahs: Array.from({ length: 114 }, (_, i) => ({ id: i + 1, tr: i === 38 ? 'Az-Zumar' : `Surah ${i + 1}` })) } as unknown as Meta
  it('opens the commentary for a commentary reference ("39:28c"), not the verse', () => {
    expect(referenceTarget(meta, { raw: '39:28c', target_kind: 'commentary', target_surah: 39, first_ayah: 28, last_ayah: 28 }))
      .toEqual({ to: 'commentary', surah: 39, ayah: 28, label: 'Commentary on Az-Zumar 39:28' })
  })
  it('opens the verse for an ayah reference, with its range', () => {
    expect(referenceTarget(meta, { raw: '39:28-30', target_kind: 'ayah', target_surah: 39, first_ayah: 28, last_ayah: 30 }))
      .toEqual({ to: 'verse', surah: 39, ayah: 28, label: 'Az-Zumar 39:28–30' })
  })
  it("opens the surah's introduction for an introduction reference", () => {
    expect(referenceTarget(meta, { raw: '39 intro', target_kind: 'introduction', target_surah: 39, first_ayah: null, last_ayah: null }))
      .toEqual({ to: 'intro', surah: 39, label: 'Introduction to Az-Zumar' })
  })
})
