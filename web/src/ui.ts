import { signal } from '@preact/signals'

/** Whether the navigation drawer is open. */
export const drawerOpen = signal(false)

/** Whether the phone's bottom sheet is open. It then takes the place of the recitation bar, so there is only ever one
 * panel at the bottom of the screen; the sheet has play and pause for its ayah meanwhile. */
export const sheetOpen = signal(false)

