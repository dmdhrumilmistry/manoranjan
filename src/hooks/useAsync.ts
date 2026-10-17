import { useEffect, useState, type DependencyList } from 'react'

export interface AsyncState<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
}

/** Runs `fn` when deps change; ignores results from superseded runs. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: undefined, error: undefined, loading: true })
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true, error: undefined }))
    fn().then(
      (data) => live && setState({ data, error: undefined, loading: false }),
      (error: unknown) =>
        live && setState({ data: undefined, error: error instanceof Error ? error : new Error(String(error)), loading: false }),
    )
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}
