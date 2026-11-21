import { useEffect, useState } from 'preact/hooks'
import { type Meta, locate } from '../data'
import { useAsync } from '../hooks'
import { ayahRef, t } from '../i18n'
import { copyWordText, renderWordCard, shareWordCard, type WordCard } from '../shareCard'
import { isWordSaved, toggleSavedWord } from '../savedWords'
import { loadWordDetails, loadWordIndex } from '../wordData'
import type { WordSelection } from '../wordSelection'
import { wordLabel } from './WordActions'

export function WordSharing({ meta, word, kind }: { meta: Meta; word: WordSelection; kind: 'copy' | 'share' }) {
  const [status, setStatus] = useState(''), [busy, setBusy] = useState(false)
  const at = locate(meta, word.ayah)
  const reference = ayahRef(meta.surahs[at.surah - 1]!, at.ayah)
  const source = word.source === 'ar' ? 'القرآن الكريم' : meta.translations.find(x => x.id === word.source)?.name ?? word.source
  const data = useAsync(() => loadWordDetails(meta, word), [word.text, word.source, word.ayah])
  const card: WordCard = { word: word.text, reference, source, glosses: data.value?.glosses ?? [], roots: data.value?.roots ?? [] }
  const picture = useAsync(() => kind === 'share' && data.value && !data.loading ? renderWordCard(card) : Promise.resolve(null), [kind, data.value, data.loading, word.text, reference, source])
  const [preview, setPreview] = useState('')
  useEffect(() => { if (!picture.value) { setPreview(''); return }; const url = URL.createObjectURL(picture.value); setPreview(url); return () => URL.revokeObjectURL(url) }, [picture.value])
  async function act(job: () => Promise<string | void>) {
    setStatus(''); setBusy(true)
    try { const result = await job(); setStatus(result === 'downloaded' ? wordLabel('Picture downloaded.', 'تصویر دریافت شد.') : result === 'shared' ? wordLabel('Shared.', 'اشتراک‌گذاری شد.') : wordLabel('Copied.', 'کپی شد.')) }
    catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setStatus(wordLabel('Could not complete this action. Please try again.', 'این کار انجام نشد. دوباره تلاش کنید.')) }
    finally { setBusy(false) }
  }
  return <>
    <p class="word-display" lang={word.language} dir="auto">{word.text}</p><p class="muted small">{reference}</p>
    {kind === 'copy' ? <>
      <button class="word-choice" disabled={busy} onClick={() => act(() => copyWordText(word.text))}>{wordLabel('Copy word', 'کپی واژه')}</button>
      <button class="word-choice" disabled={busy} onClick={() => act(async () => { const index = await loadWordIndex(meta, word.source); await copyWordText([word.text, index.texts[word.ayah - 1], reference, source].join('\n')) })}>{wordLabel('Copy with ayah', 'کپی همراه آیه')}</button>
    </> : <>
      <button class="word-choice" disabled={busy || data.loading || !!data.error} onClick={() => act(() => shareWordCard(card, false))}>{wordLabel('Share as text', 'اشتراک متن')}</button>
      {preview && !picture.loading ? <img class="word-card-preview" src={preview} alt={wordLabel('Word card preview', 'پیش‌نمایش کارت واژه')} /> : null}
      <button class="word-choice" disabled={busy || data.loading || !!data.error || picture.loading || !picture.value} onClick={() => act(() => shareWordCard(card, true, picture.value!))}>{wordLabel('Share as picture', 'اشتراک تصویر')}</button>
      {picture.error ? <p role="alert">{wordLabel('Picture could not be created.', 'تصویر ساخته نشد.')} <button onClick={picture.retry}>{t('retry')}</button></p> : null}
      {data.error ? <p role="alert">{wordLabel('Word data could not be loaded.', 'داده‌های واژه بارگیری نشد.')} <button onClick={data.retry}>{t('retry')}</button></p> : null}
    </>}
    <WordSave word={word} />
    <p class="small" role="status" aria-live="polite">{busy ? t('loading') : status}</p>
  </>
}


export function WordSave({ word }: { word: WordSelection }) {
  const [status, setStatus] = useState('')
  const saved = isWordSaved(word)
  return <><button class="word-choice" aria-pressed={saved} onClick={() => { try { toggleSavedWord(word); setStatus(isWordSaved(word) ? wordLabel('Saved on this device.', 'در این دستگاه ذخیره شد.') : wordLabel('Removed from saved words.', 'از واژه‌های ذخیره‌شده حذف شد.')) } catch { setStatus(wordLabel('Device storage is full or unavailable.', 'فضای ذخیره‌سازی دستگاه پر یا در دسترس نیست.')) } }}>{saved ? wordLabel('Remove saved word', 'حذف واژهٔ ذخیره‌شده') : wordLabel('Save word', 'ذخیرهٔ واژه')}</button>{status ? <p class="small" role="status">{status}</p> : null}</>
}
