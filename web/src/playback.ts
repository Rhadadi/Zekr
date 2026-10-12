// What plays next. Pure functions, so the rules are easy to test; audio.ts does the playing.

export type Phase = 'basmala' | 'ayah' | 'translation'

export interface Cursor {
  ayahId: number
  phase: Phase
  /** Plays of this ayah still to come, including the current one. */
  repeatLeft: number
}

export interface Plan {
  /** Last ayah id to play. */
  end: number
  /** Times each ayah plays. */
  repeat: number
  /** Play a translation recording after each ayah. */
  translation: boolean
}

/** First ayah of every surah except 1 (where it is the basmala) and 9 (which has none) is preceded by the basmala. */
export function hasBasmalaBefore(surah: number, ayah: number): boolean {
  return ayah === 1 && surah !== 1 && surah !== 9
}

export function startCursor(ayahId: number, surah: number, ayah: number, plan: Plan, withBasmala: boolean): Cursor {
  return {
    ayahId,
    phase: withBasmala && hasBasmalaBefore(surah, ayah) ? 'basmala' : 'ayah',
    repeatLeft: plan.repeat,
  }
}

/** The cursor after the current recording finishes, or null when the plan is done. */
export function afterEnded(cur: Cursor, plan: Plan): Cursor | null {
  if (cur.phase === 'basmala') return { ...cur, phase: 'ayah' }
  if (cur.phase === 'ayah' && plan.translation) return { ...cur, phase: 'translation' }
  if (cur.repeatLeft > 1) return { ayahId: cur.ayahId, phase: 'ayah', repeatLeft: cur.repeatLeft - 1 }
  if (cur.ayahId < plan.end) return { ayahId: cur.ayahId + 1, phase: 'ayah', repeatLeft: plan.repeat }
  return null
}

/** Skip to the next ayah (null at the end of the Quran). */
export function skipNext(cur: Cursor, plan: Plan, total: number): Cursor | null {
  return cur.ayahId < total ? { ayahId: cur.ayahId + 1, phase: 'ayah', repeatLeft: plan.repeat } : null
}

export function skipPrevious(cur: Cursor, plan: Plan): Cursor | null {
  return cur.ayahId > 1 ? { ayahId: cur.ayahId - 1, phase: 'ayah', repeatLeft: plan.repeat } : null
}
