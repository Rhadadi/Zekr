import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { type Meta, juzOf, pageOf, locate } from '../data'
import { ayahRef, num, surahName, t } from '../i18n'
import { href } from '../router'
import { Icon } from './Icon'

export function StudyNavigation({ meta, surahId, current, navigate }: { meta: Meta; surahId: number; current: number; navigate: (n: number) => void }) {
  const surah = meta.surahs[surahId - 1]!
  const id = surah.first + current - 1
  const [menu, setMenu] = useState<'surah' | 'ayah' | 'juz' | null>(null)
  const opener = useRef<HTMLButtonElement | null>(null)
  const open = (kind: typeof menu, button: HTMLButtonElement) => { opener.current = button; setMenu(kind) }
  const close = () => { setMenu(null); opener.current?.focus({ preventScroll: true }) }
  const choose = (target: number) => { close(); const at = locate(meta, target); if (at.surah === surahId) navigate(at.ayah); else location.hash = href.verse(at.surah, at.ayah) }
  return <div class="study-location" dir="rtl">
    <h1 class="visually-hidden">{surahName(surah)} {num(current)}</h1>
    <button aria-label={t('previous')} disabled={current <= 1} onClick={() => navigate(current - 1)}><Icon name="chevron" size={18} /></button>
    <button class="study-nav-surah" lang="ar" aria-label={`${t('surahs')}: ${surahName(surah)}`} aria-haspopup="dialog" aria-expanded={menu === 'surah'} onClick={e => open('surah', e.currentTarget)}>{surah.ar}</button>
    {/* the ring is the ayah (not the page); the page and the juz are in the list it opens */}
    <button class="study-nav-page" aria-label={`${t('goToAyah')}: ${ayahRef(surah, current)}`} aria-haspopup="dialog" aria-expanded={menu === 'ayah'} onClick={e => open('ayah', e.currentTarget)}>{num(current)}</button>
    <button class="study-prev" aria-label={t('next')} disabled={current >= surah.ayahs} onClick={() => navigate(current + 1)}><Icon name="chevron" size={18} /></button>
    {menu ? <PassagePicker label={menu === 'surah' ? t('surahs') : menu === 'juz' ? t('juz') : t('goToAyah')} close={close}>
      {menu === 'ayah' ? <p class="study-passage-where">{ayahRef(surah, current)} · {t('pageN', { n: pageOf(meta, id) })} · {t('juzN', { n: juzOf(meta, id) })}</p> : <div class="study-passage-tabs" role="group"><button aria-pressed={menu === 'surah'} onClick={() => setMenu('surah')}>{t('surahs')}</button><button aria-pressed={menu === 'juz'} onClick={() => setMenu('juz')}>{t('juz')}</button></div>}
      <div class={`study-passage-list${menu === 'ayah' ? ' study-passage-grid' : ''}`}>
        {menu === 'ayah' ? Array.from({ length: surah.ayahs }, (_, i) => <button aria-current={current === i + 1 ? 'true' : undefined} onClick={() => choose(surah.first + i)} key={i}>{num(i + 1)}</button>) : menu === 'surah' ? meta.surahs.map(s => <button key={s.id} aria-current={s.id === surahId ? 'true' : undefined} onClick={() => choose(s.first)}><small>{num(s.id)}</small>{surahName(s)}<span lang="ar">{s.ar}</span></button>) : meta.juz.map(j => <button key={j.n} aria-current={j.n === juzOf(meta, id) ? 'true' : undefined} onClick={() => choose(j.id)}>{t('juzN', { n: j.n })}<small>{t('pageN', { n: pageOf(meta, j.id) })}</small></button>)}
      </div>
    </PassagePicker> : null}
  </div>
}

function PassagePicker({ label, close, children }: { label: string; close: () => void; children: import('preact').ComponentChildren }) {
  const ref = useRef<HTMLDialogElement>(null)
  const opener = useRef(document.activeElement)
  useLayoutEffect(() => { ref.current?.showModal(); ref.current?.querySelector<HTMLElement>('[aria-current]')?.focus(); return () => { if (ref.current?.open) ref.current.close(); if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus({ preventScroll: true }) } }, [])
  return <dialog ref={ref} class="study-passage-picker" aria-label={label} onKeyDown={e => e.stopPropagation()} onCancel={e => { e.preventDefault(); close() }} onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) close() }}><header><h2>{label}</h2><button aria-label={t('close')} onClick={close}><Icon name="close" size={18} /></button></header>{children}</dialog>
}
