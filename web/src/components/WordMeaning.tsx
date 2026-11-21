import { useState } from 'preact/hooks'
import { type Meta, locate } from '../data'
import { useAsync } from '../hooks'
import { ayahRef, num, t } from '../i18n'
import { href } from '../router'
import { loadWordDetails } from '../wordData'
import { selectedWord, wordSegments, type WordSelection } from '../wordSelection'
import { WordSave } from './WordSharing'
import { wordLabel, wordSearchLink } from './WordActions'

export function WordMeaning({ meta, word, close }: { meta: Meta; word: WordSelection; close: () => void }) {
  const [root, setRoot] = useState('')
  const [limit, setLimit] = useState(24)
  const [attempt, setAttempt] = useState(0)
  const data = useAsync(() => loadWordDetails(meta, word, attempt > 0), [word.text, word.source, word.ayah, attempt])
  const details = data.value
  const forms = details?.forms.filter(form => !root || form.roots.includes(root)) ?? []
  return <>
    {data.loading ? <p role="status">{t('loading')}</p> : null}
    {data.error ? <p role="alert">{wordLabel('Word data could not be loaded.', 'داده‌های واژه بارگیری نشد.')} <button onClick={data.retry}>{t('retry')}</button></p> : null}
    {details && !data.loading ? <>
      {word.source === 'ar' ? <>
        {details.glosses.map(gloss => <p class="word-gloss" lang="fa" dir="rtl" key={gloss}>{gloss}</p>)}
        {!details.glosses.length ? <p class="muted small">{wordSegments(word.text).length > 1 ? wordLabel('Select one Arabic word to see its gloss and roots.', 'برای دیدن معنی و ریشه، یک واژهٔ عربی انتخاب کنید.') : wordLabel('No Persian gloss is available for this word here.', 'معنی فارسی این واژه در این آیه در دسترس نیست.')}</p> : null}
        {details.glossUnavailable ? <button onClick={() => setAttempt(attempt + 1)}>{t('retry')}</button> : null}
        {details.roots.length ? <div class="word-roots" role="group" aria-label={t('searchRoots')}><span>{t('searchRoots')}</span>{details.roots.map(r => <button key={r} lang="ar" aria-pressed={root === r} onClick={() => { setRoot(root === r ? '' : r); setLimit(24) }}>{r}</button>)}</div> : <p class="muted small">{wordLabel('No root is recorded for this selection.', 'ریشه‌ای برای این انتخاب ثبت نشده است.')}</p>}
        {details.roots.length > 1 ? <p class="muted small">{wordLabel('This form has several possible roots. Choose one to filter its forms.', 'برای این صورت چند ریشه ثبت شده است. با انتخاب ریشه، صورت‌های مربوط را ببینید.')}</p> : null}
      </> : <p class="muted small">{wordLabel('This is a translation word; Arabic root analysis does not apply.', 'این واژه از ترجمه است؛ ریشه‌یابی عربی برای آن کاربرد ندارد.')}</p>}
      <p class="word-count">{wordLabel(`This form: ${num(details.occurrences)} ${details.occurrences === 1 ? 'occurrence' : 'occurrences'} in ${num(details.ayahs.length)} ${details.ayahs.length === 1 ? 'ayah' : 'ayahs'}`, `این صورت: ${num(details.occurrences)} بار در ${num(details.ayahs.length)} آیه`)}</p>
      <WordSave word={word} />
      {forms.length ? <section><h3>{wordLabel('Forms in the Quran', 'صورت‌ها در قرآن')}</h3><div class="word-forms">{forms.slice(0, limit).map(form => <button key={form.text} lang="ar" onClick={() => { setRoot(''); setLimit(24); selectedWord.value = { ...word, text: form.text, ayah: form.ayah, range: undefined } }}>{form.text}</button>)}</div>{forms.length > limit ? <button class="word-choice" onClick={() => setLimit(limit + 48)}>{wordLabel('More forms', 'صورت‌های بیشتر')}</button> : null}</section> : null}
      <section><h3>{wordLabel('Ayahs with this form', 'آیه‌های دارای این صورت')}</h3><div class="word-verses">{details.ayahs.slice(0, 12).map(id => { const at = locate(meta, id); return <a key={id} href={href.verse(at.surah, at.ayah)} onClick={close}>{ayahRef(meta.surahs[at.surah - 1]!, at.ayah)}</a> })}</div>{details.ayahs.length > 12 ? <a class="word-choice" href={wordSearchLink(word, 'exact')} onClick={close}>{wordLabel('See all ayahs', 'دیدن همهٔ آیه‌ها')}</a> : null}</section>
    </> : null}
  </>
}
