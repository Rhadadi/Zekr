import { useState } from 'preact/hooks'
import { type Meta } from '../data'
import { num, surahName, surahSubtitle, t } from '../i18n'
import { href } from '../router'
import { fold } from '../search'

export function IndexView({ meta, tab }: { meta: Meta; tab: 'surah' | 'juz' }) {
  const [filter, setFilter] = useState('')
  const q = fold(filter.trim())
  const surahs = meta.surahs.filter(
    (s) => !q || [s.ar, s.fa, s.tr, s.en, String(s.id)].some((x) => fold(x).includes(q)),
  )
  return (
    <>
      <div class="tabs" role="tablist">
        <a role="tab" aria-selected={tab === 'surah'} class={tab === 'surah' ? 'on' : ''} href={href.index}>{t('surahs')}</a>
        <a role="tab" aria-selected={tab === 'juz'} class={tab === 'juz' ? 'on' : ''} href={href.juz}>{t('juz')}</a>
      </div>
      {tab === 'surah' ? (
        <>
          <input class="search-input" type="search" value={filter} placeholder={t('filterSurahs')}
            onInput={(e) => setFilter(e.currentTarget.value)} aria-label={t('filterSurahs')} />
          <ul class="list">
            {surahs.map((s) => (
              <li key={s.id}>
                <a class="row" href={href.surah(s.id)}>
                  <span class="badge">{num(s.id)}</span>
                  <span class="row-main">
                    <strong>{surahName(s)}</strong>
                    <span class="muted small">{surahSubtitle(s)} · {s.type === 'Meccan' ? t('meccan') : t('medinan')} · {t('ayahCount', { n: s.ayahs })}</span>
                  </span>
                  <span class="row-ar" lang="ar" dir="rtl">{s.ar}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <ul class="list">
          {meta.juz.map((j) => {
            const s = meta.surahs[j.surah - 1]!
            return (
              <li key={j.n}>
                <a class="row" href={href.ayah(j.surah, j.ayah)}>
                  <span class="badge">{num(j.n)}</span>
                  <span class="row-main">
                    <strong>{t('juzN', { n: j.n })}</strong>
                    <span class="muted small">{surahName(s)} · {num(j.surah)}:{num(j.ayah)}</span>
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
