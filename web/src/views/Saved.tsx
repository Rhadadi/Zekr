import { AyahCard } from '../components/AyahCard'
import { LoadError, Loading } from '../components/Page'
import { type Meta, loadText, loadTranslation } from '../data'
import { useAsync } from '../hooks'
import { t } from '../i18n'
import { bookmarks, settings } from '../store'

export function Saved({ meta }: { meta: Meta }) {
  const s = settings.value
  const data = useAsync(async () => {
    const id = s.translations[0]
    const [ar, tr] = await Promise.all([loadText(s.script), id ? loadTranslation(id) : Promise.resolve(undefined)])
    return { ar, tr, id }
  }, [s.script, s.translations[0]])
  const list = bookmarks.value
  return (
    <>
      {list.length === 0 ? <p class="status">{t('savedEmpty')}</p> : data.error ? <LoadError retry={data.retry} /> : !data.value ? <Loading /> : (
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
