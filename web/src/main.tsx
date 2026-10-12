import '@fontsource-variable/vazirmatn/wght.css'
import { effect } from '@preact/signals'
import { render } from 'preact'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { quranFontStack } from './fonts'
import { lang } from './i18n'
import { settings } from './store'
import './styles.css'

// Keep <html> in step with the settings: theme, Quran font, language and text direction.
effect(() => {
  const root = document.documentElement
  root.setAttribute('data-theme', settings.value.theme)
  root.style.setProperty('--font-quran', quranFontStack(settings.value.quranFont))
  root.lang = lang.value
  root.dir = lang.value === 'fa' ? 'rtl' : 'ltr'
})

registerSW({ immediate: true })
render(<App />, document.getElementById('app')!)
