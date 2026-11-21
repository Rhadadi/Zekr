import { AyahCard } from '../components/AyahCard'
import { LoadError, Loading } from '../components/Page'
import { type Meta, loadText, loadTranslation } from '../data'
import { useAsync } from '../hooks'
import { ayahRef, t } from '../i18n'
import { locate } from '../data'
import { route } from '../router'
import { savedWords, toggleSavedWord } from '../savedWords'
import { selectedWord } from '../wordSelection'
import { wordLabel } from '../components/WordActions'
import { useState } from 'preact/hooks'
import { bookmarks, settings } from '../store'

export function Saved({ meta }: { meta: Meta }) {
  const words = route.value.query.get('tab') === 'words'
  const [error, setError] = useState('')
  const s = settings.value
  const data = useAsync(async () => {
    if (words) return { ar: [], tr: undefined, id: undefined }
    const id = s.translations[0]
    const [ar, tr] = await Promise.all([loadText(s.script), id ? loadTranslation(id) : Promise.resolve(undefined)])
    return { ar, tr, id }
  }, [s.script, s.translations[0], words])
  const list = bookmarks.value
  return (
    <>
      <nav class="word-saved-tabs" aria-label={t('saved')}><a href="#/saved" aria-current={!words ? 'page' : undefined}>{wordLabel('Ayahs', 'آیه‌ها')}</a><a href="#/saved?tab=words" aria-current={words ? 'page' : undefined}>{wordLabel('Words', 'واژه‌ها')}</a></nav>
      {error ? <p role="alert">{error}</p> : null}
      {words ? <section aria-label={wordLabel('Saved words', 'واژه‌های ذخیره‌شده')}>
        {!savedWords.value.length ? <p class="status">{wordLabel('Words you save will appear here, on this device.', 'واژه‌های ذخیره‌شده در این دستگاه اینجا نمایش داده می‌شوند.')}</p> : savedWords.value.map(word => { const at = locate(meta, word.ayah); const available = word.source === 'ar' || meta.translations.some(t => t.id === word.source); return <article class="saved-word" key={JSON.stringify(word)}><button disabled={!available} onClick={() => { selectedWord.value = { ...word, x: innerWidth / 2, y: 160 } }}><b dir="auto" lang={word.language}>{word.text}</b><small>{ayahRef(meta.surahs[at.surah - 1]!, at.ayah)} · {meta.translations.find(t => t.id === word.source)?.name ?? 'العربية'}</small></button><button class="btn" onClick={() => { try { toggleSavedWord(word) } catch { setError(wordLabel('Device storage is unavailable.', 'ذخیره‌سازی دستگاه در دسترس نیست.')) } }} aria-label={wordLabel(`Remove ${word.text}`, `حذف ${word.text}`)}>×</button></article> })}
      </section> : list.length === 0 ? <p class="status">{t('savedEmpty')}</p> : data.error ? <LoadError retry={data.retry} /> : !data.value ? <Loading /> : (
        <div class="ayahs">
          {list.map((b) => {
            const d = data.value!
            const info = meta.translations.find((x) => x.id === d.id)
            return (
              <AyahCard key={b.id} meta={meta} id={b.id} showRef ar={d.ar[b.id - 1] as string}
                translations={info && d.tr ? [{ info, text: d.tr[b.id - 1] as string }] : []} />
            )
          })}
        </div>
      )}
    </>
  )
}
