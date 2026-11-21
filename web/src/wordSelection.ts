import { signal } from '@preact/signals'
import { fold } from './search'

export interface WordSelection {
  text: string
  ayah: number
  source: string
  language: string
  range?: Range
  x: number
  y: number
}
export const selectedWord = signal<WordSelection | null>(null)
export const wordChooser = signal<number | null>(null)
let heldUntil = 0
export const wordGestureActive = () => Date.now() < heldUntil
export const chooseAyahWords = (id: number) => { wordChooser.value = id }

const segmenters = new Map<string, Intl.Segmenter>()
/** Keep the displayed spelling and marks; only the search key is folded. */
export function wordSegments(text: string, language = 'ar'): { text: string; start: number; end: number }[] {
  if (typeof Intl.Segmenter === 'function' && !segmenters.has(language)) segmenters.set(language, new Intl.Segmenter(language, { granularity: 'word' }))
  const parts = typeof Intl.Segmenter === 'function'
    ? [...segmenters.get(language)!.segment(text)].filter(x => x.isWordLike).map(x => ({ text: x.segment, start: x.index, end: x.index + x.segment.length }))
    : [...text.matchAll(/[\p{L}\p{M}]+(?:[\u200c\u200d][\p{L}\p{M}]+)*/gu)].map(x => ({ text: x[0], start: x.index!, end: x.index! + x[0].length }))
  return parts.filter(x => /\p{L}/u.test(fold(x.text)) && !/[\u06dd\ufd3e\ufd3f]/u.test(x.text))
}

function owner(element: Element, x?: number, y?: number) {
  const context = element.closest<HTMLElement>('[data-word-source],.ar,.tr,.fl-t,.wb-ar,.wb-fa,.pw-ar,.pw-fa,.il-tr,.run-pick,.mushaf-flow .ay:not(.seg)')
  if (!context || element.closest('.merged,.mark,.il-mark,.run-n,.study-marker,.fl-n,dialog,[data-word-ui]')) return null
  const at = element.closest<HTMLElement>('[data-word-ayah],[data-id]') ?? (x !== undefined && y !== undefined ? document.elementsFromPoint(x, y).map(el => el.closest<HTMLElement>('[data-id]')).find(Boolean) : null)
  const text = at && context.contains(at) ? at : context
  const ayah = Number(at?.dataset.wordAyah ?? at?.dataset.id)
  if (!ayah) return null
  const language = context.closest<HTMLElement>('[lang]')?.lang || 'ar'
  const source = context.closest<HTMLElement>('[data-word-source]')?.dataset.wordSource ?? (language === 'ar' ? 'ar' : '')
  if (!source) return null
  return { text, ayah, language, source }
}

/** A range can cross search highlights and existing font spans without adding new word nodes. */
function textRange(root: HTMLElement, start: number, end: number): Range | null {
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let offset = 0, began = false, node: Node | null
  while ((node = walk.nextNode())) {
    const length = node.textContent?.length ?? 0
    if (!began && start < offset + length) { range.setStart(node, start - offset); began = true }
    if (began && end <= offset + length) { range.setEnd(node, end - offset); return range }
    offset += length
  }
  return null
}

export function wordAtPoint(x: number, y: number): WordSelection | null {
  // Font lines sit under transparent ayah hit areas. Inspect only their existing token spans.
  for (const line of document.querySelectorAll<HTMLElement>('.fl-t')) {
    const box = line.getBoundingClientRect()
    if (x < box.left || x > box.right || y < box.top || y > box.bottom) continue
    for (const span of line.querySelectorAll<HTMLElement>(':scope > span:not(.fl-n)')) {
      const info = owner(span, x, y)
      if (!info) continue
      for (const word of wordSegments(span.textContent ?? '')) {
        const range = textRange(span, word.start, word.end)
        if (range && [...range.getClientRects()].some(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) return { ...info, text: word.text, range, x, y }
      }
    }
    return null
  }
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null; caretRangeFromPoint?: (x: number, y: number) => Range | null }
  const caret = doc.caretPositionFromPoint?.(x, y)
  const fallback = !caret ? doc.caretRangeFromPoint?.(x, y) : null
  const node = caret?.offsetNode ?? fallback?.startContainer
  const offset = caret?.offset ?? fallback?.startOffset
  if (!node || node.nodeType !== Node.TEXT_NODE || offset === undefined) return null
  const info = owner(node.parentElement!, x, y)
  if (!info || !info.text.contains(node)) return null
  const prefix = document.createRange(); prefix.selectNodeContents(info.text); prefix.setEnd(node, offset)
  const position = prefix.toString().length
  const word = wordSegments(info.text.textContent ?? '', info.language).find(w => w.start <= position && position <= w.end)
  if (!word) return null
  const range = textRange(info.text, word.start, word.end)
  if (!range || ![...range.getClientRects()].some(r => x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2)) return null
  return { text: word.text, source: info.source, language: info.language, ayah: info.ayah, range, x, y }
}

export function selectionWord(): WordSelection | null {
  const selection = getSelection()
  if (!selection?.rangeCount || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as Element : range.startContainer.parentElement
  const end = range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer as Element : range.endContainer.parentElement
  if (!start || !end) return null
  const info = owner(start), last = owner(end)
  const text = range.toString().trim()
  if (!info || !last || info.ayah !== last.ayah || info.source !== last.source || !/\p{L}/u.test(text) || text.length > 240) return null
  const box = range.getBoundingClientRect()
  return { text, ayah: info.ayah, source: info.source, language: info.language, range: range.cloneRange(), x: box.left + box.width / 2, y: box.top }
}

export function installWordSelection() {
  let timer = 0, settle = 0, touch: { x: number; y: number } | null = null, recentTouch = 0, cancelled = false, adjusting = false
  const show = (word: WordSelection) => { heldUntil = Date.now() + 900; const selection = getSelection(); if (word.range) { selection?.removeAllRanges(); selection?.addRange(word.range) }; selectedWord.value = word }
  const context = (e: MouseEvent) => {
    if ((e.target as Element)?.closest('[data-word-ui]')) return
    if (Date.now() - recentTouch < 1200 && cancelled) { e.stopImmediatePropagation(); return }
    const word = e.clientX || e.clientY ? wordAtPoint(e.clientX, e.clientY) : selectionWord()
    if (!word) return
    if (Date.now() - recentTouch > 1200) e.preventDefault()
    e.stopImmediatePropagation(); show(word)
  }
  const double = (e: MouseEvent) => { const word = wordAtPoint(e.clientX, e.clientY); if (word) { e.stopImmediatePropagation(); show(word) } }
  const start = (e: TouchEvent) => {
    clearTimeout(timer); recentTouch = Date.now(); touch = null; cancelled = false; adjusting = !!getSelection()?.toString()
    if (e.touches.length !== 1 || (e.target as Element)?.closest('[data-word-ui]')) return
    const p = e.touches[0]!; touch = { x: p.clientX, y: p.clientY }
    const word = wordAtPoint(p.clientX, p.clientY)
    if (word) timer = window.setTimeout(() => show(word), 470)
  }
  const move = (e: TouchEvent) => { const p = e.touches[0]; if (e.touches.length !== 1 || !p || !touch || Math.hypot(p.clientX - touch.x, p.clientY - touch.y) > 8) { clearTimeout(timer); if (!adjusting) cancelled = true } }
  const end = () => { clearTimeout(timer); touch = null }
  const click = (e: MouseEvent) => { if ((e.target as Element)?.closest('[data-word-ui]')) return; if (wordGestureActive()) { e.preventDefault(); e.stopImmediatePropagation(); heldUntil = 0 } else selectedWord.value = null }
  const changed = () => { clearTimeout(settle); settle = window.setTimeout(() => { const word = selectionWord(); if (word && !(cancelled && Date.now() - recentTouch < 1200)) selectedWord.value = word }, 300) }
  const keyboard = (e: KeyboardEvent) => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { const word = selectionWord(); if (word) { e.preventDefault(); e.stopImmediatePropagation(); show(word) } } }
  document.addEventListener('contextmenu', context, true); document.addEventListener('dblclick', double, true)
  document.addEventListener('touchstart', start, { capture: true, passive: true }); document.addEventListener('touchmove', move, { capture: true, passive: true })
  document.addEventListener('touchend', end, true); document.addEventListener('touchcancel', end, true)
  document.addEventListener('click', click, true); document.addEventListener('selectionchange', changed); document.addEventListener('keydown', keyboard, true)
  return () => { clearTimeout(timer); clearTimeout(settle); document.removeEventListener('contextmenu', context, true); document.removeEventListener('dblclick', double, true); document.removeEventListener('touchstart', start, true); document.removeEventListener('touchmove', move, true); document.removeEventListener('touchend', end, true); document.removeEventListener('touchcancel', end, true); document.removeEventListener('click', click, true); document.removeEventListener('selectionchange', changed); document.removeEventListener('keydown', keyboard, true) }
}
