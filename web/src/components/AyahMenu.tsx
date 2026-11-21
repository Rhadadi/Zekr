import { useLayoutEffect, useRef } from 'preact/hooks'
import { loopAyah, player, toggleAyah } from '../audio'
import { type Meta, locate } from '../data'
import { useAsync } from '../hooks'
import { ayahRef, t } from '../i18n'
import { href } from '../router'
import { ayahLink, ayahText, copyText, shareImage, shareText } from '../share'
import { isBookmarked, toggleBookmark } from '../store'
import { loadWordDetails } from '../wordData'
import { openWordSheet, type WordSelection } from '../wordSelection'
import { classicsIndex } from '../classics'
import { tafsirIndex } from '../tafsir'
import { Icon } from './Icon'

export interface AyahMenuAt { id: number; x: number; y: number; word?: WordSelection | null }

interface Props {
  meta: Meta
  at: AyahMenuAt
  ar: string
  translations: { text: string; dir: 'rtl' | 'ltr' }[]
  /** Open the ayah's panel on its translation or its tafsir. */
  onPanel: (tafsir: boolean) => void
  onOptions: () => void
  onClose: () => void
}

/** What a right click (or a long press) on an ayah of the mushaf offers, at the pointer: the word under it with its
 * meaning, then the ayah (play, repeat, translation, tafsir, save, copy, share), then the reading options. */
export function AyahMenu({ meta, at, ar, translations, onPanel, onOptions, onClose }: Props) {
  const { id, word } = at
  const { surah, ayah } = locate(meta, id)
  const ref = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(document.activeElement)
  const p = player.value
  const playingHere = !p?.commentary && p?.ayahId === id && (p.status === 'playing' || p.status === 'loading')
  const saved = isBookmarked(id)
  const details = useAsync(async () => (word && word.source === 'ar' && meta.wbw ? loadWordDetails(meta, word) : null), [word?.text, id])
  const text = () => ayahText(meta, id, ar, translations.map((x) => x.text))

  // at the pointer, kept on the screen; focus on its first item; arrows move, Escape and a click outside close it
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    el.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, at.x))}px`
    el.style.top = `${Math.max(8, at.y + h + 8 > innerHeight ? at.y - h : at.y)}px`
    el.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true })
    const key = (e: KeyboardEvent) => {
      const items = [...el.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      const i = items.indexOf(document.activeElement as HTMLElement)
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowDown') items[(i + 1) % items.length]?.focus()
      else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length]?.focus()
      else if (e.key === 'Home') items[0]?.focus()
      else if (e.key === 'End') items[items.length - 1]?.focus()
      else if (e.key === 'Tab') close()
      else return
      if (e.key !== 'Tab') { e.preventDefault(); e.stopPropagation() }
    }
    // the page scrolled away from under it (not the small settling of the page after a jump)
    const y0 = scrollY
    const away = (e: Event) => { if (e.type === 'resize' || Math.abs(scrollY - y0) > 40) onClose() }
    document.addEventListener('keydown', key, true)
    window.addEventListener('scroll', away, { passive: true })
    window.addEventListener('resize', away)
    return () => {
      document.removeEventListener('keydown', key, true)
      window.removeEventListener('scroll', away)
      window.removeEventListener('resize', away)
    }
  }, [at])
  function close() {
    onClose()
    const o = opener.current
    const back = o instanceof HTMLElement && o.isConnected && o !== document.body ? o : document.querySelector<HTMLElement>(`.ay[data-id="${id}"]`)
    back?.focus({ preventScroll: true })
  }
  const act = (f: () => void) => () => { onClose(); f() }
  const item = (icon: Parameters<typeof Icon>[0]['name'], label: string, f: () => void, extra: Record<string, unknown> = {}) => (
    <button role="menuitem" tabIndex={-1} onClick={act(f)} {...extra}><Icon name={icon} size={18} /><span>{label}</span></button>
  )
  const gloss = details.value?.glosses
  return (
    <>
      <button class="ayah-menu-backdrop" aria-hidden="true" tabIndex={-1} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      <div ref={ref} class="ayah-menu" role="menu" aria-label={`${t('ayahMenu')}: ${ayahRef(meta.surahs[surah - 1]!, ayah)}`} data-word-ui data-testid="ayah-menu">
        {word ? (
          <div class="am-word" role="group" aria-label={word.text}>
            <p class="am-word-text" lang={word.language} dir="auto">{word.text}</p>
            {word.source === 'ar' && meta.wbw ? (
              <p class="am-gloss" lang="fa" dir="rtl" aria-live="polite">
                {details.loading ? '…' : gloss?.length ? gloss.join('، ') : <span class="muted">{t('wordNoGloss')}</span>}
              </p>
            ) : null}
            <div class="am-word-acts">
              <button role="menuitem" tabIndex={-1} onClick={act(() => openWordSheet(word, 'meaning'))}>{t('wordMeaningMore')}</button>
              <button role="menuitem" tabIndex={-1} onClick={act(() => openWordSheet(word, 'find'))}>{t('wordFind')}</button>
              <button role="menuitem" tabIndex={-1} onClick={act(() => openWordSheet(word, 'copy'))}>{t('wordCopy')}</button>
              <button role="menuitem" tabIndex={-1} onClick={act(() => openWordSheet(word, 'share'))}>{t('wordShare')}</button>
            </div>
          </div>
        ) : null}
        <p class="am-head">{ayahRef(meta.surahs[surah - 1]!, ayah)}</p>
        {item(playingHere ? 'pause' : 'play', playingHere ? t('pause') : t('playFromHere'), () => toggleAyah(id))}
        {item('repeat', t('repeatAyah'), () => loopAyah(id, true))}
        {item('book', t('ayahTranslation'), () => onPanel(false))}
        {meta.studyQuran || tafsirIndex.value || classicsIndex.value ? item('book', t('tabTafsir'), () => onPanel(true)) : null}
        {item('focus', t('openVerseView'), () => { location.hash = href.verse(surah, ayah) })}
        {item(saved ? 'bookmarkFilled' : 'bookmark', saved ? t('unbookmark') : t('bookmark'), () => toggleBookmark(id))}
        {item('copy', t('copy'), () => copyText(text()))}
        {item('share', t('share'), () => shareText(text(), ayahLink(meta, id)))}
        {item('share', t('shareImage'), () => shareImage(meta, id, ar, translations[0]?.text || undefined, translations[0]?.dir ?? 'rtl', ayahLink(meta, id)))}
        <hr />
        {item('sliders', t('pageOptions'), onOptions)}
      </div>
    </>
  )
}
