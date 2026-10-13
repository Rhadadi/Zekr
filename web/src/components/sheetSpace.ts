import type { RefObject } from 'preact'
import { useLayoutEffect } from 'preact/hooks'

/** While a bottom panel is open, keeps --sheet-h on <html> at its height, so the page under it can scroll clear of it. */
export function useSheetSpace(ref: RefObject<HTMLElement>) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const set = () => root.style.setProperty('--sheet-h', `${el.offsetHeight}px`)
    set()
    const observer = new ResizeObserver(set)
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--sheet-h')
    }
  }, [])
}
