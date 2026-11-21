import { LoadError, Loading } from '../components/Page'
import { type Meta, ayahIdOf, locate } from '../data'
import { useAsync } from '../hooks'
import { num, t } from '../i18n'
import { settings } from '../store'
import { type TafsirBlock, checkTafsir, loadSection, sectionIdFor, sectionRangeFor } from '../tafsir'

function Runs({ block }: { block: TafsirBlock }) {
  return (
    <>
      {block.r.map((run, i) => {
        if (run[1] === 'n') return null // the number of a footnote: the notes are citations, not shown
        const text = run[0] as string
        switch (run[1]) {
          case 'q': return <span key={i} class="tf-q">{text}</span>
          case 'e': return <strong key={i}>{text}</strong>
          case 'd': return <span key={i} class="tf-d">{text}</span>
          default: return text
        }
      })}
    </>
  )
}

/** Al-Mizan on the group of ayahs that holds surah:ayah. */
export function TafsirView({ meta, surah, ayah, idPrefix = 'tf' }: { meta: Meta; surah: number; ayah: number; idPrefix?: string }) {
  const id = ayahIdOf(meta, surah, Math.min(ayah, meta.surahs[surah - 1]!.ayahs))
  const data = useAsync(async () => {
    const index = await checkTafsir()
    if (!index) return null
    const sid = sectionIdFor(index, id)
    const range = sectionRangeFor(index, id)
    return sid ? { sec: await loadSection(sid), range } : null
  }, [id])
  const sec = data.value?.sec
  const range = data.value?.range
  const covers = range && locate(meta, range[0]).ayah < locate(meta, range[1]).ayah ? [locate(meta, range[0]).ayah, locate(meta, range[1]).ayah] : null
  return (
    <>
      {data.error ? <LoadError retry={data.retry} /> : data.value === undefined ? <Loading /> : !sec ? (
        <p class="status">{t('tafsirMissing')}</p>
      ) : (
        <article class="tafsir" lang="fa" dir="rtl" style={{ fontSize: `${settings.value.trSize}px` }}>
          <h2 class="tf-title">{sec.title}</h2>
          {covers ? <p class="classic-covers muted small">{t('coversAyahs', { from: num(covers[0]!), to: num(covers[1]!) })}</p> : null}
          {sec.blocks.some((b) => b.t === 'h') ? (
            <nav class="tf-parts" aria-label={t('tafsirParts')}>
              {sec.blocks.map((b, i) => (b.t === 'h' ? <a key={i} href={`#${idPrefix}-${i}`} onClick={(e) => { e.preventDefault(); document.getElementById(`${idPrefix}-${i}`)?.scrollIntoView({ behavior: 'smooth' }) }}><Runs block={b} /></a> : null))}
            </nav>
          ) : null}
          {sec.blocks.map((b, i) => {
            switch (b.t) {
              case 's': return <p key={i} id={`${idPrefix}-${i}`} class="tf-s"><Runs block={b} /></p>
              case 'h': return <h3 key={i} id={`${idPrefix}-${i}`} class="tf-h"><Runs block={b} /></h3>
              case 't': return <h4 key={i} id={`${idPrefix}-${i}`} class="tf-t"><Runs block={b} /></h4>
              default: return <p key={i} class="tf-p"><Runs block={b} /></p>
            }
          })}
        </article>
      )}
    </>
  )
}
