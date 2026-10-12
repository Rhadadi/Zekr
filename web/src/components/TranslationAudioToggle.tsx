import { lang, t } from '../i18n'
import { audioTranslations } from '../reciters'
import { settings, updateSettings } from '../store'
import { Icon } from './Icon'

/** One tap to hear the translation after each ayah, and one tap to stop. Remembers which recording you chose. */
export function toggleTranslationAudio() {
  const s = settings.value
  if (s.audioTranslation !== 'off') {
    updateSettings({ audioTranslation: 'off', lastAudioTranslation: s.audioTranslation })
    return
  }
  const remembered = audioTranslations.some((a) => a.id === s.lastAudioTranslation) ? s.lastAudioTranslation : ''
  updateSettings({ audioTranslation: remembered || (lang.value === 'fa' ? 'fa.fooladvand' : 'en.sahih') })
}

export function TranslationAudioToggle({ iconOnly = false }: { iconOnly?: boolean }) {
  const s = settings.value
  const current = audioTranslations.find((a) => a.id === s.audioTranslation)
  const label = current ? t('translationAudioOn', { name: current[lang.value] }) : t('translationAudio')
  if (iconOnly) {
    return (
      <button class={`icon-btn${current ? ' active' : ''}`} onClick={toggleTranslationAudio} aria-pressed={!!current} aria-label={t('translationAudio')} title={label}>
        <Icon name="speech" size={20} />
      </button>
    )
  }
  return (
    <button class={`chip${current ? ' on' : ''}`} onClick={toggleTranslationAudio} aria-pressed={!!current}>
      <Icon name="speech" size={18} /> <span>{label}</span>
    </button>
  )
}
