import type { JSX } from 'preact'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { loopAyah, player, toggleAyah } from '../audio'
import { type Meta, type TranslationInfo, loadWbw, locate } from '../data'
import { useAsync } from '../hooks'
import { ayahRef, num, t } from '../i18n'
import { href } from '../router'
import { ayahLink, ayahText, copyText, shareText } from '../share'
import { isBookmarked, settings, toggleBookmark } from '../store'
import { sheetOpen } from '../ui'
import { classicsIndex } from '../classics'
import { tafsirIndex } from '../tafsir'
import { Icon } from './Icon'
import { TafsirTab } from './TafsirTab'
import { StudyChips, StudyInline, StudyLink } from './StudyQuranPanel'

interface Props {
  meta: Meta
  id: number
  ar: string
  translations: { info: TranslationInfo; text: string }[]
  /** 'box': in the side box; 'popup': over the page, under the ayah. */
  variant: 'box' | 'popup'
  /** False when translations show elsewhere (inline) or not at all: the panel is then only the actions. */
  showTranslations?: boolean
  /** Opened by a long press: the list of what can be done with the ayah is open at once. */
  menu?: boolean
  /** False when the page already shows each word's meaning. */
  offerWords?: boolean
  /** Beside the page (a computer): the commentary opens under the translation, here, not on a screen of its own. */
  inlineStudy?: boolean
  style?: JSX.CSSProperties
  panelRef?: preact.Ref<HTMLDivElement>
  /** Beside the page: the translation of the whole page as one continuous text, this ayah opened in it, with tabs for
   * its tafsir and its words. */
  run?: { ids: number[]; texts: (id: number) => { info: TranslationInfo; text: string }[]; playing?: number; onPick: (id: number) => void }
  onClose: () => void
}

/** Translation and actions for an ayah on a mushaf page. */
export function AyahPanel({ meta, id, ar, translations, variant, showTranslations = true, menu = false, offerWords = true, inlineStudy = false, style, panelRef, run, onClose }: Props) {
  const { surah, ayah } = locate(meta, id)
  const saved = isBookmarked(id)
  const texts = translations.map((x) => x.text || t('mergedTranslation'))
  const text = () => ayahText(meta, id, ar, texts)
  // While this ayah is the one in the recitation bar, the bar already says which ayah it is and holds play, pause
  // and repeat: the panel does not repeat them. The phone's sheet hides the bar, so there it has them itself.
  const p = player.value
  const inPlayer = !p?.commentary && p?.ayahId === id && !sheetOpen.value
  const playingHere = !p?.commentary && p?.ayahId === id && (p.status === 'playing' || p.status === 'loading')
  // on the phone, with the translation already on the page, starting the recitation hands over to the bar
  const handOver = () => { if (!showTranslations && sheetOpen.peek()) onClose() }
  const [more, setMore] = useState(menu)
  // asked for from the list: the whole translation (when the page shows it split over its lines) and each word's meaning
  const [fullTr, setFullTr] = useState(false)
  const [words, setWords] = useState(false)
  // the commentary shown under the translation: false, true (every note on the ayah) or the id of one note
  const [study, setStudy] = useState<boolean | string>(false)
  useEffect(() => {
    setMore(menu)
    setFullTr(false)
    setWords(false)
    setStudy(false)
  }, [id, menu])
  // the tabs beside the page: the translation, then what the reader has of the ayah's tafsir and its words
  type Tab = 'tr' | 'tafsir' | 'words'
  const tabs: Tab[] = run ? ['tr', ...(meta.studyQuran || tafsirIndex.value || classicsIndex.value ? ['tafsir' as const] : []), ...(meta.wbw ? ['words' as const] : [])] : []
  const [tab, setTab] = useState<Tab>('tr')
  const shownTab: Tab = tabs.includes(tab) ? tab : 'tr'
  const wbw = useAsync(async () => (words || (run && shownTab === 'words') ? (await loadWbw(surah))[ayah - 1] ?? [] : null), [words, run, shownTab, surah, ayah])
  const showTr = showTranslations || fullTr
  // keep the opened ayah in view in the run, under the panel's head
  const runRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const list = runRef.current
    const box = list?.closest<HTMLElement>('.side-panel')
    const at = list?.querySelector<HTMLElement>('.run-ay.sel')
    if (!box || !at) return
    const head = box.querySelector<HTMLElement>('.ayah-head')?.offsetHeight ?? 0
    const tabsH = box.querySelector<HTMLElement>('.ayah-tabs')?.offsetHeight ?? 0
    const top = at.getBoundingClientRect().top - box.getBoundingClientRect().top
    if (top < head + tabsH || top > box.clientHeight - 80) box.scrollTop += top - head - tabsH - 8
  }, [id, shownTab])
  return (
    <div ref={panelRef} class={`ayah-panel ayah-${variant}`} style={style} role="region" aria-label={ayahRef(meta.surahs[surah - 1]!, ayah)} data-testid="ayah-panel">
      <div class="sheet-head ayah-head">
        <strong class={inPlayer ? 'visually-hidden' : 'ayah-ref'}>{num(surah)}:{num(ayah)}</strong>
        <div class="ayah-actions">
          {inPlayer ? null : (
            <button class="icon-btn" onClick={() => { toggleAyah(id); if (!playingHere) handOver() }} aria-label={playingHere ? t('pause') : t('playFromHere')}>
              <Icon name={playingHere ? 'pause' : 'play'} size={20} />
            </button>
          )}
          <button class="icon-btn" onClick={() => toggleBookmark(id)} aria-label={saved ? t('unbookmark') : t('bookmark')} aria-pressed={saved}>
            <Icon name={saved ? 'bookmarkFilled' : 'bookmark'} size={20} />
          </button>
          <button class="icon-btn" onClick={() => setMore(!more)} aria-label={t('more')} aria-expanded={more}>
            <Icon name="more" size={20} />
          </button>
        </div>
        <button class="icon-btn ayah-close" onClick={onClose} aria-label={t('close')}>
          <Icon name="close" size={18} />
        </button>
      </div>
      {more ? (
        <div class="ayah-more">
          {showTranslations || run ? null : (
            <button onClick={() => { setFullTr(!fullTr); setMore(false) }} aria-pressed={fullTr}>
              <Icon name="book" size={18} /> {t('ayahTranslation')}
            </button>
          )}
          {meta.wbw && offerWords && !run ? (
            <button onClick={() => { setWords(!words); setMore(false) }} aria-pressed={words}>
              <Icon name="list" size={18} /> {t('wordByWord')}
            </button>
          ) : null}
          {inPlayer ? null : (
            <button onClick={() => { loopAyah(id, true); setMore(false); handOver() }}>
              <Icon name="repeat" size={18} /> {t('repeatAyah')}
            </button>
          )}
          {tafsirIndex.value ? (
            <a href={href.tafsir(surah, ayah)} aria-label={`${t('tafsir')}: ${t('almizan')}`}>
              <Icon name="book" size={18} /> {t('almizan')}
            </a>
          ) : null}
          {classicsIndex.value ? (
            <a href={href.classic(surah, ayah)}>
              <Icon name="book" size={18} /> {t('classics')}
            </a>
          ) : null}
          {/* with nothing else in the box, its commentary is listed here rather than taking a row of its own */}
          {meta.studyQuran && !showTr && !run ? <StudyLink meta={meta} ayahID={id} onOpen={inlineStudy ? () => { setStudy(study ? false : true); setMore(false) } : undefined} open={!!study} /> : null}
          <a href={href.verse(surah, ayah)}>
            <Icon name="list" size={18} /> {t('openVerseView')}
          </a>
          <button onClick={() => { copyText(text()); setMore(false) }}>
            <Icon name="copy" size={18} /> {t('copy')}
          </button>
          <button onClick={() => { shareText(text(), ayahLink(meta, id)); setMore(false) }}>
            <Icon name="share" size={18} /> {t('share')}
          </button>
        </div>
      ) : null}
      {tabs.length > 1 ? (
        <div class="ayah-tabs" role="tablist" aria-label={ayahRef(meta.surahs[surah - 1]!, ayah)}>
          {tabs.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={shownTab === k} onClick={() => setTab(k)}>
              {t(k === 'tr' ? 'tabTranslation' : k === 'tafsir' ? 'tabTafsir' : 'tabWords')}
            </button>
          ))}
        </div>
      ) : null}
      {run ? (
        <div class="sheet-body" role={tabs.length > 1 ? 'tabpanel' : undefined}>
          {shownTab === 'tr' ? (
            <div class="tr-run" ref={runRef}>
              {run.ids.map((i) => {
                const n = locate(meta, i).ayah
                if (i !== id) {
                  const first = run.texts(i)[0]
                  return (
                    <div key={i} class={`run-ay${i === run.playing ? ' playing' : ''}`} data-id={i}>
                      <button type="button" class="run-pick" lang={first?.info.lang} dir={first?.info.dir} style={{ fontSize: settings.value.trSize }} onClick={() => run.onPick(i)}>
                        {first?.text || t('mergedTranslation')} <span class="run-n">{num(n)}</span>
                      </button>
                    </div>
                  )
                }
                return (
                  <div key={i} class={`run-ay sel${i === run.playing ? ' playing' : ''}`} data-id={i} aria-current="true">
                    {translations.map((x, k) => (
                      <div class="tr-block" key={x.info.id}>
                        {translations.length > 1 ? <p class="tr-label">{x.info.name}</p> : null}
                        <p class={`tr${x.text ? '' : ' merged'}`} lang={x.info.lang} dir={x.info.dir} style={{ fontSize: settings.value.trSize }}>
                          {texts[k]}{k === 0 ? <span class="run-n"> {num(n)}</span> : null}
                        </p>
                      </div>
                    ))}
                    {meta.studyQuran
                      ? <StudyChips meta={meta} ayahID={id} all open={typeof study === 'string' ? study : null}
                          onOpen={(entry) => setStudy(study === entry ? false : entry)} />
                      : null}
                    {study ? <StudyInline meta={meta} ayahID={id} only={typeof study === 'string' ? study : null} /> : null}
                  </div>
                )
              })}
            </div>
          ) : shownTab === 'tafsir' ? (
            <TafsirTab meta={meta} id={id} surah={surah} ayah={ayah} />
          ) : wbw.value ? (
            <p class="panel-wbw" lang="ar" dir="rtl">
              {wbw.value.map(([w, fa], k) => (
                <span class="pw" key={k}><span class="pw-ar">{w}</span><span class="pw-fa" lang="fa">{fa}</span></span>
              ))}
            </p>
          ) : null}
        </div>
      ) : (
      <div class="sheet-body">
        {words && wbw.value ? (
          <p class="panel-wbw" lang="ar" dir="rtl">
            {wbw.value.map(([w, fa], k) => (
              <span class="pw" key={k}><span class="pw-ar">{w}</span><span class="pw-fa" lang="fa">{fa}</span></span>
            ))}
          </p>
        ) : null}
        {showTr && translations.length === 0 ? <p class="muted small">{t('translationsHint')}</p> : null}
        {showTr ? translations.map((x, i) => (
          <div class="tr-block" key={x.info.id}>
            {translations.length > 1 ? <p class="tr-label">{x.info.name}</p> : null}
            <p class={`tr${x.text ? '' : ' merged'}`} lang={x.info.lang} dir={x.info.dir} style={{ fontSize: settings.value.trSize }}>
              {texts[i]}
            </p>
          </div>
        )) : null}
        {meta.studyQuran && showTr
          ? <StudyChips meta={meta} ayahID={id} all open={typeof study === 'string' ? study : null}
              onOpen={inlineStudy ? (entry) => setStudy(study === entry ? false : entry) : undefined} />
          : null}
        {inlineStudy && study ? <StudyInline meta={meta} ayahID={id} only={typeof study === 'string' ? study : null} /> : null}
        {classicsIndex.value ? (
          <div class="classic-chips">
            <a class="classic-chip" href={href.classic(surah, ayah)}><Icon name="book" size={16} /> {t('classics')}</a>
          </div>
        ) : null}
      </div>
      )}
    </div>
  )
}
