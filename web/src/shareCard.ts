import logoUrl from './assets/ayesheno-logo.png'
import wavesUrl from './assets/ayesheno-waves.png'
import { wordSegments } from './wordSelection'
import { type Meta, locate } from './data'
import { ayahRef, lang, t } from './i18n'
export interface WordCard { word: string; glosses: string[]; roots: string[]; reference: string; source: string }
export const wordCardText = (card: WordCard) => [card.word, ...card.glosses, card.roots.length ? `${card.roots.length > 1 ? 'ریشه‌های احتمالی' : 'ریشه'}: ${card.roots.join(' · ')}` : '', card.reference, card.source, 'Ayesheno · آیه شنو'].filter(Boolean).join('\n')
export async function copyWordText(text: string) {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return }
  const field = document.createElement('textarea')
  field.value = text; field.style.position = 'fixed'; field.style.opacity = '0'; document.body.append(field)
  const previous = document.activeElement
  field.select()
  try { if (!document.execCommand('copy')) throw new Error('Clipboard unavailable') }
  finally { field.remove(); if (previous instanceof HTMLElement) previous.focus({ preventScroll: true }) }
}

/** Draw locally with the reader’s loaded fonts. No words, images or preferences leave the device. */
export async function renderWordCard(card: WordCard): Promise<Blob> {
  await document.fonts.ready
  const style = getComputedStyle(document.documentElement)
  const ui = style.getPropertyValue('--font-ui').trim() || 'sans-serif'
  const arabic = style.getPropertyValue('--font-quran').trim() || 'serif'
  const canvas = document.createElement('canvas'); canvas.width = 1080
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas unavailable')
  const ctx = context
  const rows: { text: string; size: number; font: string; color: string }[] = []
  function wrap(text: string, size: number, font: string, color: string) {
    ctx.font = `${size}px ${font}`
    let line = ''
    for (const token of text.split(/\s+/)) {
      const next = line ? `${line} ${token}` : token
      if (line && ctx.measureText(next).width > 920) { rows.push({ text: line, size, font, color }); line = token } else line = next
    }
    if (line) rows.push({ text: line, size, font, color })
  }
  wrap(card.word, 76, /[\u0600-\u06ff]/.test(card.word) ? arabic : ui, '#153d34')
  card.glosses.forEach(gloss => wrap(gloss, 34, ui, '#3f5750'))
  if (card.roots.length) wrap(`${card.roots.length > 1 ? 'ریشه‌های احتمالی' : 'ریشه'}: ${card.roots.join(' · ')}`, 32, ui, '#766039')
  wrap(card.reference, 30, ui, '#3f5750')
  wrap(card.source, 25, ui, '#3f5750')
  canvas.height = Math.max(660, 290 + rows.reduce((n, row) => n + row.size * 1.85, 0))
  ctx.fillStyle = '#f8f7f1'; ctx.fillRect(0, 0, 1080, canvas.height)
  ctx.fillStyle = '#ab8b51'; ctx.fillRect(80, 92, 52, 3)
  let y = 120
  for (const row of rows) {
    y += row.size * 1.45
    ctx.font = `${row.size}px ${row.font}`; ctx.fillStyle = row.color
    ctx.direction = /[\u0600-\u06ff]/.test(row.text) ? 'rtl' : 'ltr'; ctx.textAlign = 'center'
    ctx.fillText(row.text, 540, y, 920)
    y += row.size * .4
  }
  const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src })
  const [logo, waves] = await Promise.all([load(logoUrl), load(wavesUrl)])
  // The source assets are alpha masks, as in the app header.
  for (const [img, color] of [[logo, '#00594b'], [waves, '#ac7c0e']] as const) {
    const mask = document.createElement('canvas'); mask.width = 180; mask.height = 96
    const paint = mask.getContext('2d')!; paint.drawImage(img, 0, 0, 180, 96); paint.globalCompositeOperation = 'source-in'; paint.fillStyle = color; paint.fillRect(0, 0, 180, 96)
    ctx.drawImage(mask, 450, canvas.height - 120)
  }
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png'))
}
export async function shareWordCard(card: WordCard, asImage: boolean, picture?: Blob) {
  if (!asImage) {
    const text = wordCardText(card)
    if (navigator.share) { await navigator.share({ title: card.reference, text }); return 'shared' }
    await copyWordText(text); return 'copied'
  }
  const file = new File([picture ?? await renderWordCard(card)], `ayesheno-word-${wordSegments(card.word).map(w => w.text).join('-').slice(0, 60)}.png`, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: card.reference }); return 'shared' }
  const url = URL.createObjectURL(file), link = document.createElement('a')
  link.href = url; link.download = file.name; document.body.append(link); link.click(); link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
  return 'downloaded'
}


/** An ayah as a picture to share: the Arabic in the Quran font, the translation under it, where it is from, the name
 * of the app; in the colours of the theme the reader is using. 1080 wide (a phone's share sheet scales it). */
export async function ayahCard(meta: Meta, id: number, ar: string, translation: string | undefined, dir: 'rtl' | 'ltr'): Promise<Blob> {
  const { surah, ayah } = locate(meta, id)
  const css = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  const bg = v('--bg', '#f7f7f1'), ink = v('--ink', '#1d2320'), muted = v('--muted', '#596d68'), gold = v('--gold', '#855d12'), line = v('--line', '#dce1d8')
  const quran = v('--font-quran', 'serif'), ui = v('--font-ui', 'system-ui, sans-serif')
  try { await document.fonts.ready } catch { /* draws with what there is */ }
  const W = 1080, pad = 96, inner = W - pad * 2
  const measure = document.createElement('canvas').getContext('2d')!
  const wrap = (text: string, font: string, width: number): string[] => {
    measure.font = font
    const lines: string[] = []
    let cur = ''
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word
      if (cur && measure.measureText(next).width > width) { lines.push(cur); cur = word } else cur = next
    }
    if (cur) lines.push(cur)
    return lines
  }
  // the Arabic is made smaller until it takes no more than a few lines
  let arSize = 84
  let arLines = wrap(`﴿ ${ar} ﴾`, `${arSize}px ${quran}`, inner)
  while (arLines.length > 5 && arSize > 40) { arSize -= 4; arLines = wrap(`﴿ ${ar} ﴾`, `${arSize}px ${quran}`, inner) }
  const trSize = translation && translation.length > 420 ? 30 : 36
  const trLines = translation ? wrap(translation, `${trSize}px ${ui}`, inner) : []
  const arLead = arSize * 1.9, trLead = trSize * 1.7
  const body = arLines.length * arLead + (trLines.length ? 56 + trLines.length * trLead : 0)
  const H = Math.max(1080, Math.round(pad + 40 + body + 150 + pad / 2))
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = gold; ctx.globalAlpha = 0.55; ctx.lineWidth = 3
  ctx.strokeRect(36, 36, W - 72, H - 72); ctx.globalAlpha = 1
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  let y = pad + 40 + (H - (pad + 40 + body + 150 + pad / 2)) / 2 // centred when the picture is taller than the text
  y = Math.max(y, pad + 40)
  ctx.direction = 'rtl'; ctx.fillStyle = ink; ctx.font = `${arSize}px ${quran}`
  for (const l of arLines) { y += arLead; ctx.fillText(l, W / 2, y - arSize * 0.35) }
  if (trLines.length) {
    y += 28
    ctx.fillStyle = line; ctx.fillRect(W / 2 - 60, y, 120, 3)
    y += 28
    ctx.direction = dir; ctx.fillStyle = muted === ink ? ink : ink; ctx.globalAlpha = 0.88; ctx.font = `${trSize}px ${ui}`
    for (const l of trLines) { y += trLead; ctx.fillText(l, W / 2, y - trSize * 0.3) }
    ctx.globalAlpha = 1
  }
  ctx.direction = lang.value === 'fa' ? 'rtl' : 'ltr'
  ctx.fillStyle = gold; ctx.font = `600 34px ${ui}`
  ctx.fillText(ayahRef(meta.surahs[surah - 1]!, ayah), W / 2, H - 120)
  ctx.fillStyle = muted; ctx.font = `500 28px ${ui}`; ctx.direction = 'ltr'
  ctx.fillText(t('appName'), W / 2, H - 72)
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no picture'))), 'image/png'))
}
