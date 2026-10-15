import { useEffect, useRef, useState } from 'preact/hooks'
import { playSurah, player } from '../audio'
import { AyahCard } from '../components/AyahCard'
import { Icon } from '../components/Icon'
import { LoadError, Loading } from '../components/Page'
import { type Meta, ayahIdOf, loadText, loadTranslation } from '../data'
import { useAsync } from '../hooks'
import { num, surahName, t } from '../i18n'
import { href } from '../router'
import { SurahBanner } from '../components/SurahBanner'
import { TranslationAudioToggle } from '../components/TranslationAudioToggle'
import { setLastRead, settings } from '../store'
import { StudyIntroLink } from '../components/StudyQuranPanel'

export function Reader({ meta, surahId, ayah }: { meta: Meta; surahId: number; ayah?: number }) {
  const s = settings.value
  const surah = meta.surahs[surahId - 1]!
  const trKey = s.translations.join(',')
  const data = useAsync(async () => {
    const ids = s.translations.filter((id) => meta.translations.some((x) => x.id === id))
    const [ar, ...trs] = await Promise.all([loadText(s.script), ...ids.map((id) => loadTranslation(id))])
    return { ar, trs, ids }
  }, [s.script, trKey])

  const [focused, setFocused] = useState<number | undefined>(ayah)
  const listRef = useRef<HTMLDivElement>(null)
  const playingId = player.value?.ayahId

  // Jump to the requested ayah once the text is on screen, and flash it.
  useEffect(() => {
    if (!data.value) return
    setFocused(ayah)
    if (ayah) {
      document.getElementById(`a-${ayah}`)?.scrollIntoView({ block: 'start' })
      const id = setTimeout(() => setFocused(undefined), 2500)
      return () => clearTimeout(id)
    }
  }, [!!data.value, surahId, ayah])

  // Remember where the reader is: the ayah near the top of the screen.
  useEffect(() => {
    const list = listRef.current
    if (!data.value || !list) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const n = Number((e.target as HTMLElement).dataset.ayah)
          clearTimeout(timer)
          timer = setTimeout(() => setLastRead(surahId, n), 800)
        }
      },
      { rootMargin: '-15% 0px -75% 0px' },
    )
    list.querySelectorAll('article.ayah').forEach((el) => observer.observe(el))
    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [!!data.value, surahId])

  // Scroll along with the recitation.
  useEffect(() => {
    if (!settings.value.autoScroll || playingId === undefined) return
    if (playingId < surah.first || playingId >= surah.first + surah.ayahs) return
    const el = document.getElementById(`a-${playingId - surah.first + 1}`)
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.top < 70 || r.bottom > window.innerHeight - 140) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [playingId])

  const prev = surahId > 1 ? meta.surahs[surahId - 2]! : null
  const nextSurah = surahId < 114 ? meta.surahs[surahId]! : null
  const showBasmala = surahId !== 1 && surahId !== 9

  return (
    <>
      <div class="surah-head">
        <SurahBanner name={surah.ar} />
        <p class="muted small">
          {surah.type === 'Meccan' ? t('meccan') : t('medinan')} · {t('ayahCount', { n: surah.ayahs })}
        </p>
        <button class="btn primary" onClick={() => playSurah(surahId)}>
          <Icon name="play" size={18} /> {t('playSurah')}
        </button>
        <TranslationAudioToggle />
      </div>
      <StudyIntroLink meta={meta} surah={surahId} />
      {data.error ? <LoadError retry={data.retry} /> : !data.value ? <Loading /> : (
        <div class="ayahs" ref={listRef}>
          {showBasmala ? (
            <p class="basmala" lang="ar" dir="rtl" style={{ fontSize: `${s.arabicSize}px` }}>{meta.basmala[s.script]}</p>
          ) : null}
          {Array.from({ length: surah.ayahs }, (_, i) => {
            const n = i + 1
            const id = ayahIdOf(meta, surahId, n)
            const translations = data.value!.ids.map((trId, k) => ({
              info: meta.translations.find((x) => x.id === trId)!,
              text: data.value!.trs[k]![id - 1] as string,
            }))
            return (
              <AyahCard key={id} meta={meta} id={id} ar={data.value!.ar[id - 1] as string} translations={translations}
                playing={playingId === id} focused={focused === n} />
            )
          })}
        </div>
      )}
      <nav class="surah-nav" aria-label={t('surahs')}>
        {prev ? <a class="btn" href={href.surah(prev.id)}>{num(prev.id)}. {surahName(prev)}</a> : <span />}
        {nextSurah ? <a class="btn" href={href.surah(nextSurah.id)}>{num(nextSurah.id)}. {surahName(nextSurah)}</a> : <span />}
      </nav>
    </>
  )
}
