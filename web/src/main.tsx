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

// Pinch zoom on a phone enlarges the page and with it the panels fixed to the bottom (the ayah's sheet, the
// recitation bar), which then cover the screen. While zoomed they are kept the size they were, at the bottom of what is
// in view.
const vv = window.visualViewport
if (vv) {
  const follow = () => {
    const root = document.documentElement
    const zoomed = vv.scale > 1.01
    root.classList.toggle('zoomed', zoomed)
    if (!zoomed) return
    root.style.setProperty('--vv-x', `${vv.offsetLeft}px`)
    root.style.setProperty('--vv-y', `${vv.offsetTop + vv.height - root.clientHeight}px`)
    root.style.setProperty('--vv-s', String(1 / vv.scale))
  }
  vv.addEventListener('resize', follow)
  vv.addEventListener('scroll', follow)
}

registerSW({ immediate: true })
render(<App />, document.getElementById('app')!)
