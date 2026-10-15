import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { t } from '../i18n'
import { drawerOpen } from '../ui'

const DRAG = 6 // px of movement that makes a press a drag instead of a tap
const CLOSE_BELOW = 90 // dragged down this far from the lower detent, it closes

/** The phone's bottom sheet: it holds the ayah panel or the page options over the mushaf, which stays usable behind
 * it. Two heights (about half the screen, and nearly all of it), changed by a tap on the grab handle or by dragging it;
 * dragged down from the lower height, or Escape, closes it. Its height is published as `--sheet-h` so the page can
 * keep the ayah clear of it without being padded or pushed around. */
export function Sheet({ children, onClose }: { children: preact.ComponentChildren; onClose: () => void }) {
  const [full, setFull] = useState(false)
  const [drag, setDrag] = useState<number | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const start = useRef<{ y: number; moved: boolean } | null>(null)
  const dragged = useRef(false) // the click that ends a drag is not a tap
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useLayoutEffect(() => {
    const el = root.current
    const html = document.documentElement
    if (!el) return
    const set = () => html.style.setProperty('--sheet-h', `${el.offsetHeight}px`)
    set()
    const observer = new ResizeObserver(set)
    observer.observe(el)
    return () => {
      observer.disconnect()
      html.style.removeProperty('--sheet-h')
    }
  }, [])

  // a layout effect, so the listener is there as soon as the sheet is on screen
  useLayoutEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || drawerOpen.peek()) return
      e.preventDefault()
      closeRef.current()
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])

  const onDown = (e: PointerEvent) => {
    start.current = { y: e.clientY, moved: false }
    dragged.current = false
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    const s = start.current
    if (!s) return
    const dy = e.clientY - s.y
    if (Math.abs(dy) > DRAG) s.moved = true
    if (s.moved) setDrag(dy)
  }
  const onUp = (e: PointerEvent) => {
    const s = start.current
    start.current = null
    setDrag(null)
    if (!s?.moved) return
    dragged.current = true
    const dy = e.clientY - s.y
    if (dy < -DRAG) setFull(true)
    else if (full) setFull(false)
    else if (dy > CLOSE_BELOW) onClose()
  }

  // While dragging the sheet follows the finger: taller going up, sliding off going down.
  const style = drag === null ? undefined : drag < 0 ? { height: `calc(${full ? 88 : 45}dvh - ${drag}px)`, maxHeight: '88dvh' } : { transform: `translateY(${drag}px)` }
  return (
    <div ref={root} class={`asheet${full ? ' full' : ''}${drag !== null ? ' dragging' : ''}`} style={style} data-testid="sheet">
      <button
        class="asheet-grab"
        aria-label={full ? t('sheetShrink') : t('sheetGrow')}
        aria-expanded={full}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => { start.current = null; setDrag(null) }}
        onClick={() => {
          if (dragged.current) dragged.current = false
          else setFull((f) => !f)
        }}
      >
        <span aria-hidden="true" />
      </button>
      <div class="asheet-body">{children}</div>
    </div>
  )
}
