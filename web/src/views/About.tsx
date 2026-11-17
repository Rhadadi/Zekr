import { type Meta } from '../data'
import { t } from '../i18n'

export function About({ meta }: { meta: Meta }) {
  return (
    <>
      <p>{t('aboutText')}</p>
      <p>{t('creditsText')}</p>
      <ul class="plain">
        <li><a href="https://tanzil.net" target="_blank" rel="noopener noreferrer">Tanzil Project · tanzil.net</a></li>
        <li><a href="https://tanzil.net/trans/" target="_blank" rel="noopener noreferrer">Tanzil translations</a></li>
        <li><a href="https://everyayah.com" target="_blank" rel="noopener noreferrer">EveryAyah.com</a></li>
        {meta.morphology ? <li><a href="https://corpus.quran.com/" target="_blank" rel="noopener noreferrer">Quranic Arabic Corpus 0.4 · © 2011 Kais Dukes</a> · <a href={`${import.meta.env.BASE_URL}data/search/NOTICE.txt`} target="_blank" rel="noopener noreferrer">GNU GPL / Tanzil notices</a></li> : null}
      </ul>
      <p class="muted small">App {__APP_BUILD__} · Data {meta.version}</p>
    </>
  )
}
