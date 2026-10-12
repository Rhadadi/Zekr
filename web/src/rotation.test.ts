import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ayahForSlot, mulberry32, orderForCycle, slotFor } from './rotation'

interface Vectors {
  pools: Record<string, number[] | { range: [number, number] }>
  mulberry32: { seed: number; first: number[] }[]
  orders: { pool: string; salt: number; cycle: number; order: number[] }[]
  ayahs: { pool: string; salt: number; slot: number; ayah: number }[]
  slots: { t: number; offset: number; period: number; slot: number }[]
}

const vectors: Vectors = JSON.parse(readFileSync(new URL('../../shared/test-vectors/rotation.json', import.meta.url), 'utf8'))

function pool(name: string): number[] {
  const p = vectors.pools[name]
  if (!p) throw new Error(`unknown pool ${name}`)
  if (Array.isArray(p)) return p
  const [a, b] = p.range
  return Array.from({ length: b - a + 1 }, (_, i) => a + i)
}

describe('shared rotation test vectors', () => {
  it('mulberry32 matches', () => {
    for (const v of vectors.mulberry32) {
      const rng = mulberry32(v.seed)
      expect(v.first.map(() => rng())).toEqual(v.first)
    }
  })

  it('shuffle orders match', () => {
    for (const v of vectors.orders) {
      expect(orderForCycle(pool(v.pool).length, v.cycle, v.salt)).toEqual(v.order)
    }
  })

  it('ayah for slot matches', () => {
    for (const v of vectors.ayahs) {
      expect(ayahForSlot(pool(v.pool), v.slot, v.salt), `${v.pool} salt ${v.salt} slot ${v.slot}`).toBe(v.ayah)
    }
  })

  it('slot from time matches', () => {
    for (const v of vectors.slots) {
      expect(slotFor(v.t, v.offset, v.period)).toBe(v.slot)
    }
  })
})

describe('rotation properties', () => {
  it('shows every ayah once per cycle', () => {
    const p = Array.from({ length: 40 }, (_, i) => i + 1)
    const shown = Array.from({ length: 40 }, (_, i) => ayahForSlot(p, 80 + i))
    expect([...shown].sort((a, b) => a - b)).toEqual(p)
  })

  it('rejects an empty pool', () => {
    expect(() => ayahForSlot([], 0)).toThrow()
  })
})
