import { LoadError, Loading } from '../components/Page'
import type { Meta } from '../data'
import { useAsync } from '../hooks'
import { classicBook, chooseClassicBook, booksFor, checkClassics, loadClassic } from '../classics'
import { lang, num, t } from '../i18n'
import { settings } from '../store'

/** What the classical tafsirs say on an ayah: one book at a time, picked from a list of the books that have something on this surah. */
export function ClassicView({ surah, ayah }: { meta: Meta; surah: number; ayah: number }) {
  const data = useAsync(async () => {
    const index = await checkClassics()
    if (!index) return null
    const books = booksFor(index, surah)
    const book = books.find((b) => b.id === classicBook.value) ?? books[0]
    return { source: index.source, books, book, text: book ? await loadClassic(book, surah, ayah) : null }
  }, [surah, ayah, classicBook.value])
  const d = data.value
  const l = lang.value
  return (
    <>
      {data.error ? <LoadError retry={data.retry} /> : d === undefined ? <Loading /> : !d || !d.book ? (
        <p class="status">{t('classicsMissing')}</p>
      ) : (
        <>
          {/* every book that has something on this surah, in one list to pick from */}
          <label class="field classic-pick">
            <span>{t('classicsBook', { n: num(d.books.length) })}</span>
            <select value={d.book.id} onChange={(e) => chooseClassicBook((e.target as HTMLSelectElement).value)}>
              {d.books.map((b) => <option key={b.id} value={b.id}>{b.name[l]}</option>)}
            </select>
          </label>
          <article class="tafsir classic" lang={d.book.lang} dir={d.book.lang === 'ar' ? 'rtl' : 'ltr'} style={{ fontSize: `${settings.value.trSize}px` }}>
            <p class="classic-author muted small">{d.book.author[l]}</p>
            {d.text ? d.text.split('\n').filter((p) => p.trim()).map((p, i) => <p key={i} class="tf-p">{p}</p>) : <p class="status">{t('classicsNone')}</p>}
            <p class="muted small" dir="ltr">{t('classicsSource', { source: d.source })}</p>
          </article>
        </>
      )}
    </>
  )
}
