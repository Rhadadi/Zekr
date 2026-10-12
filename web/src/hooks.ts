import { useEffect, useState } from 'preact/hooks'

export interface AsyncState<T> {
  value: T | undefined
  error: unknown
  loading: boolean
  retry: () => void
}

/** Run an async function when `deps` change. Keeps the previous value while the next one loads. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<{ value?: T; error?: unknown; loading: boolean }>({ loading: true })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    setState((s) => ({ value: s.value, loading: true }))
    fn().then(
      (value) => !cancelled && setState({ value, loading: false }),
      (error) => !cancelled && setState({ error, loading: false }),
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt])
  return { value: state.value, error: state.error, loading: state.loading, retry: () => setAttempt((a) => a + 1) }
}

/** Current time in ms, refreshed every `intervalMs`. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
