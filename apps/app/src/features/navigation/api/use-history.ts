import { useCallback, useEffect, useRef, useState } from "react"

export function useHistory(initial: string | null) {
  const [current, setCurrent] = useState<string | null>(initial)
  // bumped on every history change so canBack / canForward re-derive correctly
  const [version, setVersion] = useState(0)
  const history = useRef<string[]>(initial ? [initial] : [])
  const index = useRef(initial ? 0 : -1)

  useEffect(() => {
    if (initial && history.current.length === 0) {
      history.current = [initial]
      index.current = 0
      setCurrent(initial)
      setVersion((v) => v + 1)
    }
  }, [initial])

  const navigate = useCallback((p: string) => {
    if (history.current[index.current] === p) return
    history.current = [...history.current.slice(0, index.current + 1), p]
    index.current = history.current.length - 1
    setCurrent(p)
    setVersion((v) => v + 1)
  }, [])

  const back = useCallback(() => {
    if (index.current <= 0) return
    index.current -= 1
    setCurrent(history.current[index.current])
    setVersion((v) => v + 1)
  }, [])

  const forward = useCallback(() => {
    if (index.current >= history.current.length - 1) return
    index.current += 1
    setCurrent(history.current[index.current])
    setVersion((v) => v + 1)
  }, [])

  // version is intentionally referenced to force re-evaluation of derived flags
  void version
  const canBack = index.current > 0
  const canForward = index.current < history.current.length - 1

  return { current, navigate, back, forward, canBack, canForward }
}
