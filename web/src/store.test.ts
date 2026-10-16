import { describe, expect, it } from 'vitest'
import { migrateSettings } from './store'

describe('settings saved by older versions', () => {
  it('turns the old box position into where translations show', () => {
    expect(migrateSettings({ pageBox: 'popup' }).translationPlace).toBe('card')
    for (const old of ['bottom', 'left', 'right']) expect(migrateSettings({ pageBox: old }).translationPlace).toBe('panel')
  })

  it('does not write the retired keys back', () => {
    const out = migrateSettings({ pageBox: 'left', readMode: 'verse', theme: 'dark' })
    expect(out).toEqual({ translationPlace: 'panel', theme: 'dark' })
  })

  it('keeps a choice made after the change', () => {
    expect(migrateSettings({ translationPlace: 'inline', pageBox: 'popup' }).translationPlace).toBe('inline')
    expect(migrateSettings({}).translationPlace).toBeUndefined() // the default applies
  })

  it('makes Persian the language once, for those who had "follow the device"', () => {
    expect(migrateSettings({ lang: 'auto' }, true).lang).toBe('fa')
    expect(migrateSettings({ lang: 'auto' }, false).lang).toBe('auto') // chosen again later: kept
    expect(migrateSettings({ lang: 'en' }, true).lang).toBe('en')
  })
})
