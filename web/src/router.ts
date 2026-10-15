import { signal } from '@preact/signals'

/** The mushaf is the one reading screen and is always there. Everything else is a layer over it. */
export type LayerName =
  | 'index' | 'today' | 'daily' | 'search' | 'saved' | 'settings' | 'about'
  | 'study' | 'commentary' | 'intro' | 'tafsir'

export interface Layer {
  name: LayerName
  surah?: number
  ayah?: number
}

/** Which part of the mushaf is underneath: a page, or a surah or ayah (`select`: open that ayah's panel). */
export type Base = { page: number } | { surah: number; ayah?: number; select?: boolean }

export interface Route {
  /** Absent for routes that leave the mushaf where it is (a plain layer, or the start). */
  base?: Base
  layer: Layer | null
  query: URLSearchParams
}

const surahOf = (s: string | undefined) => (s && /^\d+$/.test(s) && Number(s) >= 1 && Number(s) <= 114 ? Number(s) : undefined)
const intOf = (s: string | undefined) => (s && /^\d+$/.test(s) ? Number(s) : undefined)

export function parseRoute(hash: string): Route {
  const [path = '', qs = ''] = hash.replace(/^#/, '').split('?')
  const query = new URLSearchParams(qs)
  const parts = path.split('/').filter(Boolean)
  const index: Route = { layer: { name: 'index' }, query }
  switch (parts[0]) {
    case 'surah':
    case 'ayah':
    case 'verse': {
      const surah = surahOf(parts[1])
      if (!surah) return index
      const ayah = intOf(parts[2])
      if (parts[0] === 'verse') return { base: { surah, ayah }, layer: { name: 'study', surah, ayah }, query }
      return { base: { surah, ayah, select: ayah !== undefined }, layer: null, query }
    }
    case 'commentary':
    case 'tafsir': {
      const surah = surahOf(parts[1])
      if (!surah) return index
      const ayah = intOf(parts[2]) ?? 1
      return { base: { surah, ayah }, layer: { name: parts[0], surah, ayah }, query }
    }
    case 'intro': {
      const surah = surahOf(parts[1])
      return surah ? { base: { surah }, layer: { name: 'intro', surah }, query } : index
    }
    case 'page': {
      const page = intOf(parts[1])
      return page && page >= 1 && page <= 604 ? { base: { page }, layer: null, query } : index
    }
    case 'today':
      return { layer: { name: 'today' }, query }
    case 'index':
    case 'daily':
    case 'search':
    case 'saved':
    case 'settings':
    case 'about':
      return { layer: { name: parts[0] }, query }
    default:
      // Opening the app shows the Quran, where you left off.
      return { layer: null, query }
  }
}

export const route = signal<Route>(parseRoute(location.hash))

const sameBase = (a: Base | null, b: Base | null) => JSON.stringify(a) === JSON.stringify(b)

/** The mushaf's position. A layer does not change it, so closing a layer lands on the same ayah; an equal
 * value is not written again, so the mushaf does not scroll when nothing changed. */
export const mushafAt = signal<Base | null>(route.value.base ?? null)

/** How many history entries lie between this layer and the mushaf entry under it. 0 or less when there is none: the
 * app was opened straight into a layer (-1), or on a layer that was reached from one of those (0). */
const stored = (history.state as { d?: number } | null)?.d
export const layerDepth = signal(stored ?? (route.value.layer ? -1 : 0))
if (stored === undefined && route.value.layer) history.replaceState({ d: -1 }, '')

function update() {
  const r = parseRoute(location.hash)
  const prev = route.peek()
  // history.state remembers the depth of entries we have been on (back and forward); a fresh entry is stamped
  const known = (history.state as { d?: number } | null)?.d
  const depth = known ?? (r.layer ? (prev.layer ? layerDepth.peek() + 1 : 1) : 0)
  if (known === undefined) history.replaceState({ d: depth }, '')
  layerDepth.value = depth
  route.value = r
  if (r.base && !sameBase(r.base, mushafAt.peek())) mushafAt.value = r.base
}

window.addEventListener('hashchange', update)

export const href = {
  /** The Quran, where you left off. */
  start: '#/',
  /** The ayah of the day. */
  today: '#/today',
  index: '#/index',
  juz: '#/index?tab=juz',
  daily: '#/daily',
  search: (q = '') => (q ? `#/search?q=${encodeURIComponent(q)}` : '#/search'),
  saved: '#/saved',
  settings: '#/settings',
  about: '#/about',
  surah: (s: number) => `#/surah/${s}`,
  /** Opens the mushaf at the ayah with it selected (share links use this; they do not open the Study view). */
  ayah: (s: number, a: number) => `#/ayah/${s}/${a}`,
  /** The Study view: one ayah at a time with translations, over the mushaf. */
  verse: (s: number, a?: number) => (a ? `#/verse/${s}/${a}` : `#/verse/${s}`),
  page: (p: number) => `#/page/${p}`,
  /** The Study Quran's commentary on an ayah (and the other ayahs its note covers). */
  commentary: (s: number, a: number) => `#/commentary/${s}/${a}`,
  /** The Study Quran's introduction to a surah. */
  intro: (s: number) => `#/intro/${s}`,
  tafsir: (s: number, a: number) => `#/tafsir/${s}/${a}`,
}

/** Close the layer: back to the mushaf as it was. Goes back through the layers opened from it, or (a link that
 * opened the app straight into a layer) puts the mushaf in its place. */
export function closeLayer() {
  const d = layerDepth.peek()
  if (d > 0) history.go(-d)
  else location.replace(href.start)
}
