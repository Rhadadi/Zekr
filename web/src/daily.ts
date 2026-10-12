import { getPool, loadText, loadTranslation, locate, type Meta } from './data'
import { ayahForSlot, currentSlot, slotStartMs } from './rotation'
import type { DailySettings, Settings } from './store'

export interface DailyAyah {
  id: number
  surah: number
  ayah: number
  ar: string
  fa?: string
  en?: string
  slot: number
  startsAt: number
  endsAt: number
  poolSize: number
}

/** Which pool the settings draw from: 'all', or the ayahs that fit in full for the shown translation. */
export function poolName(d: DailySettings): string {
  if (d.pool === 'all' || d.show === 'ar') return 'all'
  return `fits.${d.show === 'en' ? d.en : d.fa}`
}

export async function dailyAyah(meta: Meta, settings: Settings, nowMs: number, slotOffset = 0): Promise<DailyAyah> {
  const d = settings.daily
  const pool = await getPool(poolName(d))
  const slot = currentSlot(nowMs, d.period) + slotOffset
  const id = ayahForSlot(pool, slot, d.salt)
  const { surah, ayah } = locate(meta, id)
  const [ar, fa, en] = await Promise.all([
    loadText(settings.script),
    d.show === 'fa' || d.show === 'both' ? loadTranslation(d.fa) : undefined,
    d.show === 'en' || d.show === 'both' ? loadTranslation(d.en) : undefined,
  ])
  return {
    id,
    surah,
    ayah,
    ar: ar[id - 1] as string,
    fa: fa?.[id - 1],
    en: en?.[id - 1],
    slot,
    startsAt: slotStartMs(slot, d.period),
    endsAt: slotStartMs(slot + 1, d.period),
    poolSize: pool.length,
  }
}
