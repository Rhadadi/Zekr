import { it, expect } from 'vitest'
import { validSavedWords } from './savedWords'
it('rejects malformed saved words and never retains a live DOM range', () => {
  const good = { text: 'ایمان', ayah: 12, source: 'fa.safavi', language: 'fa' }
  expect(validSavedWords([null, { ...good, ayah: 0 }, { ...good, source: 'javascript:alert(1)' }, { ...good, language: 'unknown' }, { ...good, text: 'x'.repeat(241) }, { ...good, range: 'stale' }])).toEqual([good])
})
it('deduplicates the same context while retaining different ayahs and sources', () => {
  const good = { text: 'ایمان', ayah: 12, source: 'fa.safavi', language: 'fa' }
  expect(validSavedWords([good, good, { ...good, ayah: 13 }, { ...good, source: 'fa.fooladvand' }])).toHaveLength(3)
})
