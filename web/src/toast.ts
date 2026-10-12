import { signal } from '@preact/signals'

export const toast = signal<string | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

export function showToast(message: string, ms = 1800) {
  toast.value = message
  clearTimeout(timer)
  timer = setTimeout(() => (toast.value = null), ms)
}
