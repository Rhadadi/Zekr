import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { type Meta, loadMorphology, loadText, loadTranslation, locate } from '../data'
import { gotoTargets } from '../goto'
import { useAsync } from '../hooks'
import { ayahRef, t } from '../i18n'
import { href } from '../router'
import { SearchEngine } from '../smartSearch'
import { settings } from '../store'
import { findOpen, gotoOpen } from '../ui'
import { hrefOf, targetLabel } from './GoTo'
import { Icon } from './Icon'

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

/** One search engine for the menu's field, built once for the chosen translations (the texts are cached anyway). */
const engines = new Map<string, Promise<{ engine: SearchEngine; texts: Map<string, string[]> }>>()
function engineFor(meta: Meta, ids: string[]) {
  const key = `${meta.version}:${ids.join(',')}`
  let p = engines.get(key)
  if (!p) {
    p = (async () => {
      const [clean, morphology, ...trs] = await Promise.all([loadText('clean'), meta.morphology ? loadMorphology().catch(() => null) : null, ...ids.map((id) => loadTranslation(id))])
      const corpora = [{ key: 'ar', texts: clean }, ...trs.map((texts, i) => ({ key: ids[i]!, texts }))]
      return { engine: new SearchEngine(corpora, morphology), texts: new Map(corpora.map((c) => [c.key, c.texts])) }
    })()
    p.catch(() => engines.delete(key))
    engines.set(key, p)
  }
  return p
}

/** The text of a result with the words searched for marked, cut around the first of them. */
function Snippet({ text, words, dir, lang }: { text: string; words: string[]; dir: 'rtl' | 'ltr'; lang: string }) {
  const lower = text.toLowerCase()
  const hits = words.map((w) => w.toLowerCase()).filter((w) => w.length > 1)
  const at = hits.map((w) => lower.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? -1
  const start = at > 60 ? text.lastIndexOf(' ', at - 40) + 1 : 0
  const shown = (start > 0 ? '… ' : '') + text.slice(start)
  if (!hits.length) return <span class="qs-text" dir={dir} lang={lang}>{shown}</span>
  const re = new RegExp(`(${hits.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return <span class="qs-text" dir={dir} lang={lang}>{shown.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))}</span>
}

/** The menu's search field: results show under it as one types (places first: a surah, a page, 2:255; then ayahs), and
 * a result opens its ayah on the page at once. Enter (or "all results") opens the search page with its filters. */
export function QuickSearch({ meta, go, autoFocus = false, onEscape }: { meta: Meta; go: (to: string) => void; autoFocus?: boolean; onEscape?: () => void }) {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const field = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const ids = settings.value.translations.filter((id) => meta.translations.some((x) => x.id === id))
  // the texts load when the field is first used, not when the menu opens
  const [wanted, setWanted] = useState(false)
  const data = useAsync(async () => (wanted ? engineFor(meta, ids) : null), [wanted, ids.join(',')])
  useEffect(() => {
    const id = setTimeout(() => setQuery(input.trim()), 120)
    return () => clearTimeout(id)
  }, [input])
  useEffect(() => setActive(-1), [query])
  useEffect(() => { if (autoFocus) field.current?.focus() }, [])
  const places = useMemo(() => (query ? gotoTargets(meta, query).slice(0, 4) : []), [query])
  const found = useMemo(() => (query && data.value ? data.value.engine.search(query, { limit: 12, typing: true }) : null), [query, data.value])
  const items: { to: string; key: string }[] = [
    ...places.map((x) => ({ to: hrefOf(x), key: `p${hrefOf(x)}` })),
    ...(found?.hits ?? []).map((h) => { const at = locate(meta, h.id); return { to: href.ayah(at.surah, at.ayah), key: `a${h.id}` } }),
  ]
  const all = { to: href.search(query), key: 'all' }
  const list = query ? [...items, all] : []
  const shown = (open || !!onEscape) && !!query
  const choose = (to: string) => {
    setOpen(false)
    field.current?.blur()
    go(to)
  }
  useEffect(() => {
    if (active < 0) return
    box.current?.querySelectorAll<HTMLElement>('[role="option"]')[active]?.scrollIntoView({ block: 'nearest' })
  }, [active])
  return (
    <div class="quick-search" onFocusOut={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false) }}>
      <form class="drawer-search" role="search" onSubmit={(e) => {
        e.preventDefault()
        if (active >= 0 && list[active]) return choose(list[active]!.to)
        if (input.trim()) choose(href.search(input.trim()))
      }}>
        <input ref={field} type="search" name="q" enterKeyHint="search" autoComplete="off" spellcheck={false} dir="auto" placeholder={t('searchPlaceholder')} aria-label={t('navSearch')} title={`${t('navSearch')} (${MOD}+F)`}
          role="combobox" aria-expanded={shown} aria-controls="quick-search-list" aria-autocomplete="list"
          aria-activedescendant={shown && active >= 0 ? `qs-${active}` : undefined}
          value={input}
          onFocus={() => { setWanted(true); setOpen(true) }}
          onInput={(e) => { setWanted(true); setInput(e.currentTarget.value); setOpen(true) }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && list.length) { e.preventDefault(); setOpen(true); setActive((active + 1) % list.length) }
            else if (e.key === 'ArrowUp' && list.length) { e.preventDefault(); setActive(active <= 0 ? list.length - 1 : active - 1) }
            else if (e.key === 'Escape' && onEscape) { e.preventDefault(); e.stopPropagation(); onEscape() }
            else if (e.key === 'Escape' && (shown || input)) { e.preventDefault(); e.stopPropagation(); if (shown) setOpen(false); else setInput('') }
          }} />
        {input ? <button type="button" class="icon-btn" aria-label={t('searchClear')} onClick={() => { setInput(''); setQuery(''); field.current?.focus() }}><Icon name="close" size={18} /></button> : null}
        <button type="submit" class="icon-btn" aria-label={t('navSearch')}><Icon name="search" size={20} /></button>
      </form>
      {shown ? (
        <div class="qs-panel" ref={box} id="quick-search-list" role="listbox" aria-label={t('navSearch')} data-testid="quick-search">
          {places.map((x, i) => {
            const l = targetLabel(meta, x)
            return (
              <a key={hrefOf(x)} id={`qs-${i}`} role="option" aria-selected={active === i} class={`qs-item qs-place${active === i ? ' on' : ''}`} href={hrefOf(x)}
                onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.preventDefault(); choose(hrefOf(x)) }}>
                <Icon name="goto" size={18} /><span class="qs-main">{l.main}</span>{l.sub ? <span class="qs-sub" lang="ar">{l.sub}</span> : null}
              </a>
            )
          })}
          {data.loading || (wanted && !data.value && !data.error) ? <p class="qs-note" role="status">{t('searching')}</p> : null}
          {data.error ? <p class="qs-note" role="alert">{t('loadFailed')} <button class="btn" onClick={data.retry}>{t('retry')}</button></p> : null}
          {found && found.total === 0 && !places.length ? <p class="qs-note" role="status">{t('noResults')}</p> : null}
          {found?.hits.map((h, k) => {
            const i = places.length + k
            const at = locate(meta, h.id)
            const to = href.ayah(at.surah, at.ayah)
            const info = h.key === 'ar' ? undefined : meta.translations.find((x) => x.id === h.key)
            const text = data.value!.texts.get(h.key)?.[h.id - 1] ?? ''
            return (
              <a key={h.id} id={`qs-${i}`} role="option" aria-selected={active === i} class={`qs-item${active === i ? ' on' : ''}`} href={to}
                onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.preventDefault(); choose(to) }}>
                <span class="qs-ref">{ayahRef(meta.surahs[at.surah - 1]!, at.ayah)}</span>
                <Snippet text={text} words={h.words.length ? h.words : query.split(/\s+/)} dir={info?.dir ?? 'rtl'} lang={info?.lang ?? 'ar'} />
              </a>
            )
          })}
          {found && found.total > 0 ? (
            <a id={`qs-${list.length - 1}`} role="option" aria-selected={active === list.length - 1} class={`qs-item qs-all${active === list.length - 1 ? ' on' : ''}`} href={all.to}
              onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.preventDefault(); choose(all.to) }}>
              {t('results', { n: found.total })} · {t('searchSeeAll')} <Icon name="chevron" size={16} />
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}


/** Ctrl/Cmd-F: the same search in a see-through box over whatever is open, results as one types; a result opens its
 * ayah on the page. Pressed again while the box is open, the browser's own find in the page comes up instead. */
export function FindBox({ meta }: { meta: Meta }) {
  useEffect(() => {
    // by key position, so it is the same on a Persian keyboard
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.code !== 'KeyF' || findOpen.peek()) return
      e.preventDefault()
      gotoOpen.value = false
      findOpen.value = true
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])
  return findOpen.value ? <FindDialog meta={meta} /> : null
}

function FindDialog({ meta }: { meta: Meta }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<Element | null>(document.activeElement)
  useEffect(() => {
    const d = dialog.current
    d?.showModal()
    return () => {
      if (d?.open) d.close()
      const back = opener.current
      if (back instanceof HTMLElement && back.isConnected) back.focus({ preventScroll: true })
    }
  }, [])
  const close = () => (findOpen.value = false)
  return (
    <dialog ref={dialog} class="find-box" aria-label={t('navSearch')} data-testid="find-box" onClose={() => dialog.current && close()} onClick={(e) => e.target === e.currentTarget && close()}>
      <QuickSearch meta={meta} autoFocus onEscape={close} go={(to) => { close(); location.hash = to }} />
    </dialog>
  )
}
