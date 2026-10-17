import { signal } from '@preact/signals'

/** Whether the navigation drawer is open. */
export const drawerOpen = signal(false)

/** Whether the menu is docked open at the left of the page (a wide window; it then is not a modal). Remembered, so a
 * reader who likes it open finds it open. */
const savedDock = (() => { try { return localStorage.getItem('zekr.dock') === '1' } catch { return false } })()
export const dockOpen = signal(savedDock)
export function setDock(open: boolean) {
  dockOpen.value = open
  try { localStorage.setItem('zekr.dock', open ? '1' : '0') } catch { /* a convenience only */ }
}

/** Whether the phone's bottom sheet is open. It then takes the place of the recitation bar, so there is only ever one
 * panel at the bottom of the screen; the sheet has play and pause for its ayah meanwhile. */
export const sheetOpen = signal(false)

/** Whether the "Go to…" box (Ctrl/Cmd-K, or the menu) is open. */
export const gotoOpen = signal(false)

/** Counts the times the drawer was asked for the mushaf's reading options (they used to have a button in the bar). */
export const pageOptionsAsked = signal(0)

