import { type Meta, locate } from './data'
import { ayahRef, t } from './i18n'
import { showToast } from './toast'

/** Text for copying or sharing an ayah: Arabic, translations, and where it is from. */
export function ayahText(meta: Meta, id: number, ar: string, translations: string[]): string {
  const { surah, ayah } = locate(meta, id)
  const parts = [ar, ...translations.filter(Boolean), `— ${ayahRef(meta.surahs[surah - 1]!, ayah)}`]
  return parts.join('\n\n')
}

export function ayahLink(meta: Meta, id: number): string {
  const { surah, ayah } = locate(meta, id)
  return `${location.origin}${location.pathname}#/ayah/${surah}/${ayah}`
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    el.remove()
  }
  showToast(t('copied'))
}

export async function shareText(text: string, url: string) {
  if (navigator.share) {
    try {
      await navigator.share({ text, url })
    } catch {
      /* cancelled */
    }
  } else {
    await copyText(`${text}\n${url}`)
  }
}
