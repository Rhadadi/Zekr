import { LoadError, Loading } from '../components/Page'
import { type Meta, ayahIdOf } from '../data'
import { useAsync } from '../hooks'
import { t } from '../i18n'
import { settings } from '../store'
import { type TafsirBlock, checkTafsir, loadSection, sectionIdFor } from '../tafsir'

const faDigits = (n: number) => String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)] as string)

function Runs({ block }: { block: TafsirBlock }) {
  return (
    <>
      {block.r.map((run, i) => {
        if (run[1] === 'n') return <sup key={i} class="fn">{faDigits(run[0] as number)}</sup>
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
export function TafsirView({ meta, surah, ayah }: { meta: Meta; surah: number; ayah: number }) {
  const id = ayahIdOf(meta, surah, Math.min(ayah, meta.surahs[surah - 1]!.ayahs))
  const data = useAsync(async () => {
    const index = await checkTafsir()
    if (!index) return null
    const sid = sectionIdFor(index, id)
    return sid ? loadSection(sid) : null
  }, [id])
  const sec = data.value
  return (
    <>
      {data.error ? <LoadError retry={data.retry} /> : data.value === undefined ? <Loading /> : !sec ? (
        <p class="status">{t('tafsirMissing')}</p>
      ) : (
        <article class="tafsir" lang="fa" dir="rtl" style={{ fontSize: `${settings.value.trSize}px` }}>
          <h2 class="tf-title">{sec.title}</h2>
          {sec.blocks.some((b) => b.t === 'h') ? (
            <nav class="tf-parts" aria-label={t('tafsirParts')}>
              {sec.blocks.map((b, i) => (b.t === 'h' ? <a key={i} href={`#tf-${i}`} onClick={(e) => { e.preventDefault(); document.getElementById(`tf-${i}`)?.scrollIntoView({ behavior: 'smooth' }) }}><Runs block={b} /></a> : null))}
            </nav>
          ) : null}
          {sec.blocks.map((b, i) => {
            switch (b.t) {
              case 's': return <p key={i} id={`tf-${i}`} class="tf-s"><Runs block={b} /></p>
              case 'h': return <h3 key={i} id={`tf-${i}`} class="tf-h"><Runs block={b} /></h3>
              case 't': return <h4 key={i} id={`tf-${i}`} class="tf-t"><Runs block={b} /></h4>
              default: return <p key={i} class="tf-p"><Runs block={b} /></p>
            }
          })}
          {sec.notes.length ? (
            <section class="tf-notes">
              <h3>{t('sources')}</h3>
              <ol>{sec.notes.map((n, i) => <li key={i}>{n}</li>)}</ol>
            </section>
          ) : null}
          <p class="muted small">{t('almizanCredit')}</p>
        </article>
      )}
    </>
  )
}
