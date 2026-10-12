import { useEffect, useState } from 'preact/hooks'
import { AyahCard } from '../components/AyahCard'
import { LoadError, PageHeader } from '../components/Page'
import { type Meta, loadText, loadTranslation } from '../data'
import { useAsync } from '../hooks'
import { t, num } from '../i18n'
import { search } from '../search'
import { settings } from '../store'

export function SearchView({ meta, initial }: { meta: Meta; initial: string }) {
  const [input, setInput] = useState(initial)
  const [query, setQuery] = useState(initial)
  const s = settings.value
  const trKey = s.translations.join(',')

  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(input)
      history.replaceState(null, '', input.trim() ? `#/search?q=${encodeURIComponent(input.trim())}` : '#/search')
    }, 250)
    return () => clearTimeout(id)
  }, [input])

  const corpora = useAsync(async () => {
    const clean = await loadText('clean')
    const trs = await Promise.all(s.translations.map((id) => loadTranslation(id)))
    return [{ key: 'ar', texts: clean }, ...trs.map((texts, i) => ({ key: s.translations[i]!, texts }))]
  }, [trKey])

  const found = corpora.value && query.trim() ? search(query, corpora.value) : undefined
  const script = useAsync(() => loadText(s.script), [s.script])

  return (
    <>
      <PageHeader title={t('navSearch')} />
      <input class="search-input" type="search" autofocus value={input} placeholder={t('searchPlaceholder')}
        onInput={(e) => setInput(e.currentTarget.value)} aria-label={t('navSearch')} />
      {corpora.error ? <LoadError retry={corpora.retry} /> : null}
      {!query.trim() ? <p class="muted tip">{t('searchHint')}</p> : null}
      {query.trim() && corpora.loading && !found ? <p class="status" role="status">{t('searching')}</p> : null}
      {found ? (
        found.total === 0 ? <p class="status" role="status">{t('noResults')}</p> : (
          <>
            <p class="muted small" role="status">
              {found.total > found.hits.length ? t('resultsMore', { n: found.hits.length }) : t('results', { n: found.total })}
              {found.total > found.hits.length ? ` (${num(found.total)})` : ''}
            </p>
            <div class="ayahs">
              {found.hits.map((h) => {
                const arText = (corpora.value![0]!.texts[h.id - 1] as string)
                const arMatched = h.key === 'ar'
                return (
                  <AyahCard key={h.id} meta={meta} id={h.id} showRef query={query}
                    ar={arMatched ? arText : (script.value?.[h.id - 1] ?? arText)}
                    translations={s.translations.map((id, i) => ({
                      info: meta.translations.find((x) => x.id === id)!,
                      text: corpora.value![i + 1]!.texts[h.id - 1] as string,
                    })).slice(0, 1)} />
                )
              })}
            </div>
          </>
        )
      ) : null}
    </>
  )
}
