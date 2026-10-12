// The ayah-of-the-day rule. Defined in shared/rotation-spec.md; the test cases in
// shared/test-vectors/rotation.json must pass here and in ios/ZekrKit.

export const PERIODS = { hourly: 3600, every3h: 10800, daily: 86400 } as const
export type Period = 3600 | 10800 | 86400

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }
}

export function orderForCycle(n: number, cycle: number, salt = 0): number[] {
  const rng = mulberry32((cycle ^ salt) >>> 0)
  const order = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    // (rng() * (i + 1)) >> 32, exact because the product is below 2^45
    const j = Math.floor((rng() * (i + 1)) / 4294967296)
    const tmp = order[i] as number
    order[i] = order[j] as number
    order[j] = tmp
  }
  return order
}

let lastOrder: { n: number; cycle: number; salt: number; order: number[] } | null = null

export function ayahForSlot(pool: readonly number[], slot: number, salt = 0): number {
  const n = pool.length
  if (n === 0) throw new RangeError('empty pool')
  const cycle = Math.floor(slot / n)
  if (!lastOrder || lastOrder.n !== n || lastOrder.cycle !== cycle || lastOrder.salt !== salt) {
    lastOrder = { n, cycle, salt, order: orderForCycle(n, cycle, salt) }
  }
  return pool[lastOrder.order[slot % n] as number] as number
}

/** Slot number for a Unix time (seconds) in a time zone `offset` seconds east of UTC. */
export function slotFor(unixSeconds: number, offsetSeconds: number, period: number): number {
  return Math.floor((unixSeconds + offsetSeconds) / period)
}

/** The device's UTC offset in seconds at a given time (positive = east of UTC). */
export function utcOffsetAt(ms: number): number {
  return -new Date(ms).getTimezoneOffset() * 60
}

export function currentSlot(nowMs: number, period: number): number {
  return slotFor(Math.floor(nowMs / 1000), utcOffsetAt(nowMs), period)
}

/** When a slot starts, in ms since epoch (local time boundaries, DST-aware). */
export function slotStartMs(slot: number, period: number): number {
  let ms = (slot * period - utcOffsetAt(Date.now())) * 1000
  ms = (slot * period - utcOffsetAt(ms)) * 1000
  return ms
}
