import type { Meta } from '../data'
import { booksFor, chooseClassicBook, chooseTafsirPick, classicBook, classicsIndex, tafsirPick } from '../classics'
import { lang, t } from '../i18n'
import { href } from '../router'
import { tafsirIndex } from '../tafsir'
import { ClassicText } from '../views/Classic'
import { TafsirView } from '../views/Tafsir'
import { Icon } from './Icon'
import { StudyInline } from './StudyQuranPanel'

/** The Tafsir tab beside an ayah: one list of everything the reader has on it (Al-Mizan first, the classical books,
 * the Study Quran's English notes last), and what the chosen one says, right here. */
export function TafsirTab({ meta, id, surah, ayah }: { meta: Meta; id: number; surah: number; ayah: number }) {
  const l = lang.value
  const books = classicsIndex.value ? booksFor(classicsIndex.value, surah) : []
  const sources: { value: string; label: string }[] = [
    ...(tafsirIndex.value ? [{ value: 'almizan', label: `${t('tafsir')}: ${t('almizan')}` }] : []),
    ...books.map((b) => ({ value: b.id, label: b.name[l] })),
    ...(meta.studyQuran ? [{ value: 'study', label: t('studyQuranName') }] : []),
  ]
  const wanted = tafsirPick.value === 'classic' ? classicBook.value : tafsirPick.value
  const current = sources.find((x) => x.value === wanted)?.value ?? sources[0]?.value
  const book = books.find((b) => b.id === current)
  const pick = (v: string) => {
    if (v === 'almizan' || v === 'study') chooseTafsirPick(v)
    else { chooseTafsirPick('classic'); chooseClassicBook(v) }
  }
  const page = current === 'almizan' ? href.tafsir(surah, ayah) : book ? href.classic(surah, ayah) : undefined
  return (
    <>
      <label class="field classic-pick">
        <span>{t('tabTafsir')}</span>
        <select value={current} onChange={(e) => pick((e.target as HTMLSelectElement).value)}>
          {sources.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
      </label>
      {current === 'almizan' ? <TafsirView meta={meta} surah={surah} ayah={ayah} />
        : current === 'study' ? <StudyInline meta={meta} ayahID={id} only={null} />
        : book ? <ClassicText book={book} surah={surah} ayah={ayah} /> : null}
      {page ? (
        <a class="mrow mlink" href={page}>{t('openFull')}<span class="chev-fwd"><Icon name="chevron" size={16} /></span></a>
      ) : null}
    </>
  )
}
