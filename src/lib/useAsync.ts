import { useCallback, useEffect, useRef, useState } from 'react'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * Run an async loader on mount (and when deps change). Provides retry.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null })
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const run = useCallback(() => {
    let active = true
    setState({ data: null, loading: true, error: null })
    loaderRef.current()
      .then((data) => {
        if (active) setState({ data, loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (active)
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : 'Lỗi không xác định',
          })
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => run(), [run])

  return { ...state, retry: run }
}
