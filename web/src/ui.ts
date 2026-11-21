import { computed, effect, signal } from '@preact/signals'

/** Whether the navigation drawer is open. */
export const drawerOpen = signal(false)
export const drawerSection = signal<'menu' | 'settings'>('menu')
let drawerOpener: HTMLElement | null = null
export function openDrawer(from: HTMLElement, section: 'menu' | 'settings' = 'menu') {
  drawerOpener = from
  drawerSection.value = section
  drawerOpen.value = true
}
export function takeDrawerOpener() {
  const from = drawerOpener
  drawerOpener = null
  return from?.isConnected ? from : null
}

/** Whether the menu is docked open at the left of the page (a wide window; it then is not a modal). Open the first time,
 * then remembered, so a reader who closes it finds it closed. */
const savedDock = (() => { try { return localStorage.getItem('zekr.dock') !== '0' } catch { return true } })()
export const dockOpen = signal(savedDock)
export function setDock(open: boolean) {
  dockOpen.value = open
  try { localStorage.setItem('zekr.dock', open ? '1' : '0') } catch { /* a convenience only */ }
}

/** Zen: the bars and both side panels are put away and the page has the screen to itself. */
export const zenMode = signal(false)

/** The window's width, for the layout of the panels beside the page. */
export const winWidth = signal(typeof window === 'undefined' ? 1280 : window.innerWidth)
if (typeof window !== 'undefined') window.addEventListener('resize', () => { winWidth.value = window.innerWidth })

/** The narrowest the page gets beside the panels before the menu steps aside for the panel at the right. */
export const PAGE_MIN = 520
/** The page's width and the menu's width in a wide window: what styles.css works out from 100vw (keep the two alike). */
export function wideLayout(w: number) {
  const page = Math.min(1100, Math.max(560, w - 720))
  return { page, dock: Math.min(320, Math.max(264, (w - page) / 2 - 56)) }
}
/** Room taken at the left by the docked menu, and at the right by the translation panel (with their gaps). */
const dockRoom = (w: number) => 40 + wideLayout(w).dock
const sideRoom = (r: number) => 56 + r

/** The translation panel's width beside the page, when the reader has dragged it (null: the menu's width). */
const savedSide = (() => { try { const v = Number(localStorage.getItem('zekr.sideWidth')); return v > 0 ? v : null } catch { return null } })()
export const sideWidth = signal<number | null>(savedSide)
export const SIDE_MIN = 260
/** As wide as leaves the page room, without the menu. */
export const sideMax = (w: number) => Math.max(SIDE_MIN, w - 16 - 56 - 420)
export function setSideWidth(r: number | null) {
  const v = r === null ? null : Math.round(Math.min(sideMax(winWidth.peek()), Math.max(SIDE_MIN, r)))
  sideWidth.value = v
  try { v === null ? localStorage.removeItem('zekr.sideWidth') : localStorage.setItem('zekr.sideWidth', String(v)) } catch { /* a convenience only */ }
}
/** Whether the translation panel is open beside the page. */
export const sideOpen = signal(false)
/** The panel at the right is so wide that the page would be squeezed: the menu steps aside while it is open. */
export const dockCrowded = computed(() => {
  const r = sideWidth.value
  if (!sideOpen.value || r === null) return false
  const w = winWidth.value
  return w - dockRoom(w) - sideRoom(r) < PAGE_MIN
})
/** The menu asked for while the panel crowds it out: the panel narrows to make room for both. */
export function fitSideToDock() {
  const w = winWidth.peek()
  setSideWidth(w - dockRoom(w) - PAGE_MIN - 56)
  setDock(true)
}
if (typeof document !== 'undefined') {
  effect(() => {
    const r = sideWidth.value
    if (r === null) document.documentElement.style.removeProperty('--rw')
    else document.documentElement.style.setProperty('--rw', `${r}px`)
  })
}

/** Whether the phone's bottom sheet is open. It then takes the place of the recitation bar, so there is only ever one
 * panel at the bottom of the screen; the sheet has play and pause for its ayah meanwhile. */
export const sheetOpen = signal(false)

/** Whether the "Go to…" box (Ctrl/Cmd-K, or the menu) is open. */
export const gotoOpen = signal(false)

/** Counts the times the drawer was asked for the mushaf's reading options (they used to have a button in the bar). */
export const pageOptionsAsked = signal(0)

