import { type Meta, locate } from './data'
import { ayahRef, t } from './i18n'
import { ayahCard } from './shareCard'
import { showToast } from './toast'

/** Text for copying or sharing an ayah, as it would be written in a message: the Arabic between the Quran's brackets,
 * each translation under it, and where it is from. */
export function ayahText(meta: Meta, id: number, ar: string, translations: string[]): string {
  const { surah, ayah } = locate(meta, id)
  const parts = [`﴿ ${ar} ﴾`, ...translations.filter(Boolean), `— ${ayahRef(meta.surahs[surah - 1]!, ayah)}`]
  return parts.join('\n\n')
}

/** The ayah as a picture: shared with the phone's share sheet where it takes pictures, otherwise saved as a file. */
export async function shareImage(meta: Meta, id: number, ar: string, translation: string | undefined, dir: 'rtl' | 'ltr', url: string) {
  const { surah, ayah } = locate(meta, id)
  try {
    const blob = await ayahCard(meta, id, ar, translation, dir)
    const file = new File([blob], `ayesheno-${surah}-${ayah}.png`, { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], url })
      return
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    showToast(t('imageSaved'))
  } catch (e) {
    if ((e as Error)?.name !== 'AbortError') showToast(t('imageFailed'))
  }
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
