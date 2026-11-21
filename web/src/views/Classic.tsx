import { LoadError, Loading } from '../components/Page'
import type { Meta } from '../data'
import { useAsync } from '../hooks'
import { type ClassicBook, classicBook, chooseClassicBook, booksFor, checkClassics, loadClassicRange } from '../classics'
import { lang, num, t } from '../i18n'
import { settings } from '../store'

/** What one classical book says on an ayah: its name and author, the text in its own direction, where it is from. */
export function ClassicText({ book, surah, ayah }: { book: ClassicBook; surah: number; ayah: number }) {
  const data = useAsync(() => loadClassicRange(book, surah, ayah), [book.id, surah, ayah])
  const l = lang.value
  return (
    <article class="tafsir classic" lang={book.lang} dir={book.lang === 'en' ? 'ltr' : 'rtl'} style={{ fontSize: `${settings.value.trSize}px` }}>
      <h2 class="tf-title">{book.name[l]}</h2>
      <p class="classic-author muted small">{book.author[l]}</p>
      {data.error ? <LoadError retry={data.retry} /> : data.value === undefined ? <Loading /> : data.value ? (
        <>
          {data.value.from < data.value.to ? <p class="classic-covers muted small">{t('coversAyahs', { from: num(data.value.from), to: num(data.value.to) })}</p> : null}
          {data.value.text.split('\n').filter((p) => p.trim()).map((p, i) =>
            // "# " begins the heading of a part of the text (Meybodi's three rounds)
            p.startsWith('# ') ? <h3 key={i} class="classic-part">{p.slice(2)}</h3> : <p key={i} class="tf-p">{p}</p>)}
        </>
      ) : <p class="status">{t('classicsNone')}</p>}
    </article>
  )
}

/** What the classical tafsirs say on an ayah: one book at a time, picked from a list of the books that have something on this surah. */
export function ClassicView({ surah, ayah }: { meta: Meta; surah: number; ayah: number }) {
  const data = useAsync(async () => {
    const index = await checkClassics()
    if (!index) return null
    const books = booksFor(index, surah)
    return { books, book: books.find((b) => b.id === classicBook.value) ?? books[0] }
  }, [surah, classicBook.value])
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
          <ClassicText book={d.book} surah={surah} ayah={ayah} />
        </>
      )}
    </>
  )
}
