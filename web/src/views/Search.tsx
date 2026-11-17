import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { AyahCard } from '../components/AyahCard'
import { hrefOf, targetLabel } from '../components/GoTo'
import { Icon } from '../components/Icon'
import { gotoTargets } from '../goto'
import { LoadError } from '../components/Page'
import { type Meta, loadMorphology, loadText, loadTranslation } from '../data'
import { useAsync } from '../hooks'
import { t, num, surahName } from '../i18n'
import { SearchEngine, type SearchMode } from '../smartSearch'
import { settings } from '../store'
import { StudySearchPanel } from '../components/StudyQuranPanel'
import '../search.css'

export function SearchView({ meta, initial }: { meta: Meta; initial: string }) {
  const [input, setInput] = useState(initial)
  const [query, setQuery] = useState(initial)
  const [mode, setMode] = useState<SearchMode>(() => {
    const value = new URLSearchParams(location.hash.split('?')[1]).get('mode')
    return value === 'exact' || value === 'root' ? value : 'smart'
  })
  const [surah, setSurah] = useState(() => {
    const value = Number(new URLSearchParams(location.hash.split('?')[1]).get('surah'))
    return value >= 1 && value <= 114 ? value : 0
  })
  const [limit, setLimit] = useState(60)
  const field = useRef<HTMLInputElement>(null)
  const s = settings.value
  const trKey = s.translations.join(',')

  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(input)
      const params = new URLSearchParams()
      if (input.trim()) params.set('q', input.trim())
      if (mode !== 'smart') params.set('mode', mode)
      if (surah) params.set('surah', String(surah))
      const suffix = params.toString()
      history.replaceState(null, '', `#/search${suffix ? `?${suffix}` : ''}`)
    }, 250)
    return () => clearTimeout(id)
  }, [input, mode, surah])
  useEffect(() => setLimit(60), [query, mode, surah])

  const corpora = useAsync(async () => {
    const clean = await loadText('clean')
    const trs = await Promise.all(s.translations.map((id) => loadTranslation(id)))
    return [{ key: 'ar', texts: clean }, ...trs.map((texts, i) => ({ key: s.translations[i]!, texts }))]
  }, [trKey])

  const morphology = useAsync(() => meta.morphology ? loadMorphology() : Promise.resolve(null), [meta.morphology?.version])
  const engine = useMemo(() => corpora.value ? new SearchEngine(corpora.value, morphology.value) : null, [corpora.value, morphology.value])
  const selected = surah ? meta.surahs[surah - 1] : undefined
  const found = useMemo(() => query.trim() ? engine?.search(query, {
    mode, first: selected?.first, last: selected ? selected.first + selected.ayahs - 1 : undefined, limit,
  }) : undefined, [engine, query, mode, surah, limit])
  const waiting = corpora.loading || (morphology.loading && !found?.total)
  // a reference or a name is a place to go first, so "12:2" is never an empty text search
  const places = query.trim() ? gotoTargets(meta, query) : []
  const script = useAsync(() => loadText(s.script), [s.script])

  return (
    <section class="search-page" aria-label={t('navSearch')}>
      <form class="smart-search" role="search" onSubmit={e => { e.preventDefault(); setQuery(input) }}>
        <Icon name="search" size={22} />
        <input ref={field} class="search-input" type="search" dir="auto" autofocus value={input} maxLength={240} autoComplete="off" spellcheck={false} placeholder={t('searchPlaceholder')}
          onInput={(e) => setInput(e.currentTarget.value)} aria-label={t('navSearch')} aria-describedby="search-help" />
        {input ? <button type="button" aria-label={t('searchClear')} onClick={() => { setInput(''); field.current?.focus({ preventScroll: true }) }}><Icon name="close" size={18} /></button> : null}
      </form>
      <p class="search-help" id="search-help">{t('searchKeyboardHint')}</p>
      <div class="search-filters">
        <label><span>{t('searchMethod')}</span><select value={mode} onChange={e => setMode(e.currentTarget.value as SearchMode)}>
          <option value="smart">{t('searchSmart')}</option>
          <option value="exact">{t('searchExact')}</option>
          <option value="root" disabled={!morphology.value}>{t('searchByRoot')}</option>
        </select></label>
        <label><span>{t('surahs')}</span><select value={surah} onChange={e => setSurah(Number(e.currentTarget.value))}>
          <option value="0">{t('searchAllSurahs')}</option>
          {meta.surahs.map(s => <option key={s.id} value={s.id}>{num(s.id)}. {surahName(s)}</option>)}
        </select></label>
      </div>
      {morphology.error ? <p class="muted small">{t('searchRootsUnavailable')} <button class="btn" onClick={morphology.retry}>{t('retry')}</button></p> : null}
      {found?.roots.length ? <div class="search-roots" role="group" aria-label={t('searchRoots')}><span>{t('searchRoots')}</span>{found.roots.map(root => <button key={root} onClick={() => { setInput(root); setMode('root') }} aria-label={t('searchThisRoot', { root })}><span lang="ar" dir="rtl">{root}</span></button>)}</div> : null}
      {meta.studyQuran ? <StudySearchPanel meta={meta} query={query} /> : null}
      {corpora.error ? <LoadError retry={corpora.retry} /> : null}
      {!query.trim() ? <p class="muted tip">{t('searchHint')}</p> : null}
      {places.length ? (
        <ul class="list search-places" aria-label={t('goTo')}>
          {places.map((x) => {
            const l = targetLabel(meta, x)
            return (
              <li key={hrefOf(x)}>
                <a class="row" href={hrefOf(x)}>
                  <Icon name="goto" size={20} />
                  <span class="row-main">{l.main}</span>
                  {l.sub ? <span class="goto-sub" lang={x.kind === 'juz' ? undefined : 'ar'}>{l.sub}</span> : null}
                </a>
              </li>
            )
          })}
        </ul>
      ) : null}
      {query.trim() && waiting ? <p class="status" role="status">{t('searching')}</p> : null}
      {found ? (
        found.total === 0 ? (waiting || places.length ? null : <div class="search-empty"><p class="status" role="status">{t('noResults')}</p>{found.suggestions.length ? <div class="search-suggestions"><span>{t('searchDidYouMean')}</span>{found.suggestions.map(value => <button key={value} onClick={() => setInput(value)}>{value}</button>)}</div> : null}</div>) : (
          <>
            <p class="search-count muted small" role="status">
              {found.total > found.hits.length ? t('resultsMore', { n: found.hits.length }) : t('results', { n: found.total })}
              {found.total > found.hits.length ? ` (${num(found.total)})` : ''}
            </p>
            <div class="ayahs search-results">
              {found.hits.map((h) => {
                const arText = (corpora.value![0]!.texts[h.id - 1] as string)
                const translationIds = h.key === 'ar' ? s.translations.slice(0, 1) : [h.key]
                return (
                  <div class="search-result" key={h.id}>
                  {h.match === 'root' ? <p class="search-reason">{t('searchRelatedRoot')} <span lang="ar" dir="rtl">{h.roots.join(' · ')}</span></p> : null}
                  <AyahCard meta={meta} id={h.id} showRef query={query} arQuery={h.words.length ? h.words.join(' ') : undefined}
                    ar={script.value?.[h.id - 1] ?? arText}
                    translations={translationIds.map(id => ({
                      info: meta.translations.find((x) => x.id === id)!,
                      text: corpora.value![s.translations.indexOf(id) + 1]!.texts[h.id - 1] as string,
                    }))} />
                  </div>
                )
              })}
            </div>
            {found.total > found.hits.length ? <button class="btn search-more" onClick={() => setLimit(value => value + 60)}>{t('searchMore')}</button> : null}
          </>
        )
      ) : null}
    </section>
  )
}
