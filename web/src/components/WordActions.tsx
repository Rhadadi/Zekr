import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { type Meta, loadMorphology, loadText, loadTranslation, locate } from '../data'
import { useAsync } from '../hooks'
import { ayahRef, lang, num, t } from '../i18n'
import { SearchEngine } from '../smartSearch'
import { href, route } from '../router'
import { installWordSelection, selectedWord, wordChooser, wordSegments, type WordSelection } from '../wordSelection'

export const wordLabel = (en: string, fa: string) => lang.value === 'fa' ? fa : en

export function wordSearchLink(word: WordSelection, mode = word.source === 'ar' ? 'root' : 'exact') {
  return `#/search?${new URLSearchParams({ q: word.text, mode, in: word.source })}`
}

export function WordActions({ meta }: { meta: Meta }) {
  const word = selectedWord.value
  const chooser = wordChooser.value
  const [sheet, setSheet] = useState(false)
  const [anchor, setAnchor] = useState({ x: 16, y: 80 })
  useEffect(installWordSelection, [])
  useLayoutEffect(() => {
    if (!word) return
    const position = () => {
      if (word.range && !word.range.startContainer.isConnected) { selectedWord.value = null; return }
      const box = word.range?.getBoundingClientRect()
      const width = Math.min(280, innerWidth - 24)
      setAnchor({ x: Math.max(12, Math.min(innerWidth - width - 12, (box ? box.left + box.width / 2 : word.x) - width / 2)), y: Math.max(8, Math.min(innerHeight - 60, (box?.top ?? word.y) > 100 ? (box?.top ?? word.y) - 58 : (box?.bottom ?? word.y) + 12)) })
    }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !sheet) { e.preventDefault(); e.stopImmediatePropagation(); selectedWord.value = null; getSelection()?.removeAllRanges() } }
    position(); document.addEventListener('scroll', position, true); window.addEventListener('resize', position); document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('scroll', position, true); window.removeEventListener('resize', position); document.removeEventListener('keydown', key, true) }
  }, [word, sheet])
  return <>
    {word && !sheet ? <div class="word-toolbar" data-word-ui role="toolbar" aria-label={wordLabel('Word actions', 'گزینه‌های واژه')} style={{ left: anchor.x, top: anchor.y }}>
      <button onClick={() => setSheet(true)}>{wordLabel('Find in the Quran', 'یافتن در قرآن')}</button>
      <button aria-label={t('close')} onClick={() => { selectedWord.value = null }}>×</button>
    </div> : null}
    {word && sheet ? <WordDialog label={wordLabel('Word actions', 'گزینه‌های واژه')} close={() => setSheet(false)}><WordSearch meta={meta} word={word} close={() => { setSheet(false); selectedWord.value = null }} /></WordDialog> : null}
    {chooser ? <ChooseWords meta={meta} id={chooser} close={() => { wordChooser.value = null }} /> : null}
  </>
}

function WordSearch({ meta, word, close }: { meta: Meta; word: WordSelection; close: () => void }) {
  const data = useAsync(async () => {
    const texts = word.source === 'ar' ? await loadText('clean') : await loadTranslation(word.source)
    const morphology = word.source === 'ar' && meta.morphology ? await loadMorphology() : null
    return new SearchEngine([{ key: word.source, texts }], morphology)
  }, [word.source, meta.version])
  const at = locate(meta, word.ayah)
  return <>
    <p class="word-display" lang={word.language} dir="auto">{word.text}</p>
    <p class="muted small">{ayahRef(meta.surahs[at.surah - 1]!, at.ayah)}</p>
    {word.source === 'ar' ? <SearchChoice mode="root" title={t('searchByRoot')} available={!!meta.morphology} /> : null}
    <SearchChoice mode="exact" title={word.source === 'ar' ? t('searchExact') : meta.translations.find(x => x.id === word.source)?.name ?? t('ayahTranslation')} available />
    {data.error ? <p role="alert">{wordLabel('Search data could not be loaded.', 'داده‌های جستجو بارگیری نشد.')} <button onClick={data.retry}>{t('retry')}</button></p> : null}
  </>
  function SearchChoice({ mode, title, available }: { mode: 'root' | 'exact'; title: string; available: boolean }) {
    const result = available ? data.value?.search(word.text, { mode }) : null
    return <a class="word-choice" aria-disabled={!available} href={available ? wordSearchLink(word, mode) : undefined} onClick={e => {
      e.preventDefault(); if (!available) return
      if (route.peek().layer?.name === 'study') history.replaceState(history.state, '', href.verse(at.surah, at.ayah))
      close(); location.hash = wordSearchLink(word, mode)
    }}><span>{title}</span><small>{result ? wordLabel(`${num(result.total)} ayahs`, `${num(result.total)} آیه`) : available ? '…' : wordLabel('Unavailable', 'در دسترس نیست')}</small></a>
  }
}

export function WordDialog({ label, close, children }: { label: string; close: () => void; children: import('preact').ComponentChildren }) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef(document.activeElement)
  useLayoutEffect(() => { ref.current?.showModal(); return () => { if (ref.current?.open) ref.current.close(); if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus({ preventScroll: true }) } }, [])
  return <dialog ref={ref} data-word-ui class="word-dialog" aria-label={label} onKeyDown={e => e.stopPropagation()} onCancel={e => { e.preventDefault(); close() }} onClick={e => { if (e.target === e.currentTarget) close() }}><header><h2>{label}</h2><button aria-label={t('close')} onClick={close}>×</button></header>{children}</dialog>
}

function ChooseWords({ meta, id, close }: { meta: Meta; id: number; close: () => void }) {
  const data = useAsync(() => loadText('uthmani'), [])
  return <WordDialog label={t('words')} close={close}><div class="word-picker">{wordSegments(data.value?.[id - 1] ?? '').map((word, i) => <button lang="ar" key={i} onClick={() => { close(); selectedWord.value = { text: word.text, ayah: id, source: 'ar', language: 'ar', x: innerWidth / 2, y: 160 } }}>{word.text}</button>)}</div><p class="muted small">{meta.surahs[locate(meta, id).surah - 1]!.ar}</p></WordDialog>
}
