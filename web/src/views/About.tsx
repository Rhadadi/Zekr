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
      </ul>
      <p class="muted small">Data {meta.version}</p>
    </>
  )
}
