import { signal } from '@preact/signals'

export type RouteName = 'start' | 'home' | 'index' | 'reader' | 'page' | 'tafsir' | 'daily' | 'search' | 'saved' | 'settings' | 'about'

export interface Route {
  name: RouteName
  /** Surah and ayah for the reader. */
  surah?: number
  ayah?: number
  /** Mushaf page, for the page view. */
  page?: number
  /** Show verse by verse whatever the reading mode setting says. */
  verse?: boolean
  query: URLSearchParams
}

export function parseRoute(hash: string): Route {
  const [path = '', qs = ''] = hash.replace(/^#/, '').split('?')
  const query = new URLSearchParams(qs)
  const parts = path.split('/').filter(Boolean)
  const num = (s: string | undefined) => (s && /^\d+$/.test(s) ? Number(s) : undefined)
  switch (parts[0]) {
    case 'surah':
    case 'ayah':
    case 'verse': {
      const surah = num(parts[1])
      if (surah && surah >= 1 && surah <= 114) return { name: 'reader', surah, ayah: num(parts[2]), verse: parts[0] === 'verse', query }
      return { name: 'index', query }
    }
    case 'tafsir': {
      const surah = num(parts[1])
      if (surah && surah >= 1 && surah <= 114) return { name: 'tafsir', surah, ayah: num(parts[2]) ?? 1, query }
      return { name: 'index', query }
    }
    case 'page': {
      const page = num(parts[1])
      if (page && page >= 1 && page <= 604) return { name: 'page', page, query }
      return { name: 'index', query }
    }
    case 'today':
      return { name: 'home', query }
    case 'index':
    case 'daily':
    case 'search':
    case 'saved':
    case 'settings':
    case 'about':
      return { name: parts[0], query }
    default:
      // Opening the app shows the Quran, where you left off.
      return { name: 'start', query }
  }
}

export const route = signal<Route>(parseRoute(location.hash))

window.addEventListener('hashchange', () => {
  route.value = parseRoute(location.hash)
  window.scrollTo(0, 0)
})

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
  ayah: (s: number, a: number) => `#/ayah/${s}/${a}`,
  /** Always verse by verse. */
  verse: (s: number, a?: number) => (a ? `#/verse/${s}/${a}` : `#/verse/${s}`),
  page: (p: number) => `#/page/${p}`,
  tafsir: (s: number, a: number) => `#/tafsir/${s}/${a}`,
}
