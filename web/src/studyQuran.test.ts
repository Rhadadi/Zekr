import { describe, expect, it, vi } from 'vitest'
import { entriesForAyah, loadStudyTafsir, searchStudyEntries, type StudyEntry, type StudyTafsir } from './studyQuran'
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
