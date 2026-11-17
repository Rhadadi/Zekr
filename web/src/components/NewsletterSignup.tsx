import { useState } from 'preact/hooks'
import { lang, t } from '../i18n'
import { settings } from '../store'

/** The ayah by email (server/newsletter, on the home server). Sign-up also works by an email to `address`, which
 * matters in Iran: duckdns.org cannot be reached there, Gmail can. The menu shows the section once `address` is set. */
export const NEWSLETTER = { api: 'https://ayesheno.duckdns.org/newsletter/', address: '' }

type Freq = 'daily' | 'weekly'
type State = 'idle' | 'sending' | 'pending' | 'active' | 'invalid' | 'later' | 'unreachable'

const MESSAGES: Partial<Record<State, Parameters<typeof t>[0]>> = {
  pending: 'nlPending', active: 'nlActive', invalid: 'nlInvalid', later: 'nlLater', unreachable: 'nlUnreachable',
}

/** An email field, daily or weekly, and the way to join by email. The issue is in the reader's language, with the
 * translation and reciter they read with, at six in the morning in their time zone. */
export function NewsletterSignup() {
  const [freq, setFreq] = useState<Freq>('daily')
  const [state, setState] = useState<State>('idle')
  const word = t(freq === 'weekly' ? 'nlWeekly' : 'nlDaily')

  const submit = async (e: Event) => {
    e.preventDefault()
    const email = String(new FormData(e.currentTarget as HTMLFormElement).get('email') ?? '').trim()
    const s = settings.peek()
    const l = lang.peek()
    setState('sending')
    try {
      const r = await fetch(`${NEWSLETTER.api}subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email, freq, lang: l, reciter: s.reciter,
          tr: s.translations.find((id) => id.startsWith(`${l}.`)) ?? '',
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })
      if (r.ok) setState(((await r.json()) as { state: string }).state === 'pending' ? 'pending' : 'active')
      else setState(r.status === 400 ? 'invalid' : r.status === 429 ? 'later' : 'unreachable')
    } catch {
      setState('unreachable')
    }
  }

  const message = MESSAGES[state]
  return (
    <div class="nl">
      <p class="nl-intro">{t('nlIntro')}</p>
      <form onSubmit={submit}>
        <label class="nl-email">
          <span class="visually-hidden">{t('nlEmail')}</span>
          <input type="email" name="email" required autocomplete="email" dir="ltr" placeholder={t('nlEmail')} onInput={() => setState('idle')} />
        </label>
        <div class="mrow" role="group" aria-label={t('nlHowOften')}>
          <span>{t('nlHowOften')}</span>
          <span class="seg seg-text">
            {(['daily', 'weekly'] as Freq[]).map((f) => (
              <button type="button" key={f} aria-pressed={freq === f} onClick={() => setFreq(f)}>{t(f === 'daily' ? 'nlDaily' : 'nlWeekly')}</button>
            ))}
          </span>
        </div>
        <button class="nl-go" type="submit" disabled={state === 'sending'}>{t('nlJoin')}</button>
      </form>
      <p class="nl-msg" role="status" aria-live="polite">{message ? t(message) : ''}</p>
      <p class="nl-mail">
        {t('nlByMail')} <a href={`mailto:${NEWSLETTER.address}?subject=${encodeURIComponent(word)}`} dir="ltr">{NEWSLETTER.address}</a>
        {' '}{t('nlByMailWord', { word })}
      </p>
    </div>
  )
}
