import { useEffect, useRef, useState } from 'preact/hooks'
import type { Meta } from '../data'
import { type Target, gotoTargets } from '../goto'
import { num, surahName, t } from '../i18n'
import { href } from '../router'
import { gotoOpen } from '../ui'

const hrefOf = (x: Target) => (x.kind === 'ayah' ? href.ayah(x.surah!, x.ayah!) : x.kind === 'surah' ? href.surah(x.surah!) : href.page(x.page!))

/** "Go to…": one field for a surah, an ayah (2:255), a page or a juz. Opened with Ctrl/Cmd-K or from the menu. */
export function GoTo({ meta }: { meta: Meta }) {
  useEffect(() => {
    // by key position, so it is the same on a Persian keyboard
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyK') {
        e.preventDefault()
        gotoOpen.value = !gotoOpen.value
      }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])
  return gotoOpen.value ? <GoToBox meta={meta} /> : null
}

function GoToBox({ meta }: { meta: Meta }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const results = gotoTargets(meta, query)
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
  const close = () => (gotoOpen.value = false)
  const label = (x: Target) => {
    const s = x.surah ? meta.surahs[x.surah - 1]! : undefined
    if (x.kind === 'ayah') return { main: `${surahName(s!)} ${num(x.surah!)}:${num(x.ayah!)}`, sub: s!.ar }
    if (x.kind === 'surah') return { main: `${num(x.surah!)} · ${surahName(s!)}`, sub: s!.ar }
    if (x.kind === 'juz') return { main: t('juzN', { n: x.juz! }), sub: t('pageN', { n: x.page! }) }
    return { main: t('pageN', { n: x.page! }), sub: '' }
  }
  const choose = (x: Target | undefined) => {
    if (!x) return
    close()
    location.hash = hrefOf(x)
  }
  const at = Math.min(active, Math.max(0, results.length - 1))
  return (
    <dialog ref={dialog} class="goto" aria-label={t('goTo')} onClose={close} onClick={(e) => e.target === e.currentTarget && close()}>
      <input
        type="text" class="goto-input" dir="auto" autofocus autocomplete="off" autocapitalize="off" spellcheck={false} enterKeyHint="go"
        role="combobox" aria-expanded={results.length > 0} aria-controls="goto-list" aria-autocomplete="list"
        aria-activedescendant={results.length ? `goto-${at}` : undefined}
        aria-label={t('goTo')} placeholder={t('goToHint')} value={query}
        onInput={(e) => { setQuery(e.currentTarget.value); setActive(0) }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            if (results.length) setActive((at + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            choose(results[at])
          }
        }}
      />
      <ul id="goto-list" class="goto-list" role="listbox" aria-label={t('goTo')}>
        {results.map((x, i) => {
          const l = label(x)
          return (
            <li key={hrefOf(x)} id={`goto-${i}`} role="option" aria-selected={i === at} class={i === at ? 'on' : ''} onMouseMove={() => setActive(i)} onClick={() => choose(x)}>
              <span>{l.main}</span>
              {l.sub ? <span class="goto-sub" lang={x.kind === 'juz' ? undefined : 'ar'}>{l.sub}</span> : null}
            </li>
          )
        })}
      </ul>
      {query.trim() && !results.length ? <p class="goto-none muted" role="status">{t('goToNone')}</p> : null}
    </dialog>
  )
}
