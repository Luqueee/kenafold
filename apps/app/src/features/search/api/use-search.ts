import { useEffect, useRef, useState } from "react"
import { fsGateway, type GrepHit } from "@/features/filesystem/infra/fs.gateway"
import type { SearchResult } from "@/features/filesystem/domain/file-entry"
import { logger } from "@/shared/lib/logger"

export function useSearchIndex(root: string, enabled: boolean) {
  const [indexing, setIndexing] = useState(false)
  const [size, setSize] = useState<number | null>(null)
  const reqRef = useRef(0)

  useEffect(() => {
    if (!enabled) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setIndexing(true)
    setSize(null)
    /* eslint-enable react-hooks/set-state-in-effect */
    const myReq = ++reqRef.current
    const ref = reqRef
    fsGateway
      .index(root)
      .then((n) => {
        if (myReq !== ref.current) return
        setSize(n)
      })
      .catch((e) => {
        if (myReq !== ref.current) return
        logger.error("index failed", e)
      })
      .finally(() => {
        if (myReq === ref.current) setIndexing(false)
      })
    return () => {
      // Bump req to discard pending callbacks, clear loading.
      ref.current++
      setIndexing(false)
    }
  }, [root, enabled])

  return { indexing, size }
}

export function useSearch(root: string, query: string, enabled: boolean) {
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const reqIdRef = useRef(0)

  // Effect synchronizes UI state with an external system (Tauri search index)
  // including a debounce timer and request cancellation. The setStates inside
  // are unavoidable for this pattern.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!enabled || !query.trim()) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    /* eslint-enable react-hooks/set-state-in-effect */
    const myReq = ++reqIdRef.current
    const reqRef = reqIdRef
    const timer = window.setTimeout(() => {
      if (myReq !== reqRef.current) return
      fsGateway
        .search(root, query)
        .then((r) => {
          if (myReq !== reqRef.current) return
          setResults(r)
        })
        .catch((e) => {
          if (myReq !== reqRef.current) return
          logger.error("search failed", e)
          setResults([])
        })
        .finally(() => {
          if (myReq === reqRef.current) setLoading(false)
        })
    }, 40)
    return () => {
      window.clearTimeout(timer)
      // Discard pending IPC callbacks + clear loading for this query.
      reqRef.current++
      setLoading(false)
    }
  }, [root, query, enabled])

  return { results, loading }
}

export function useGrep(root: string, query: string, enabled: boolean) {
  const [results, setResults] = useState<GrepHit[]>([])
  const [loading, setLoading] = useState(false)
  const reqIdRef = useRef(0)

  // Same pattern as useSearch — debounced request to the grep backend with
  // proper cancellation semantics.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!enabled || !query.trim()) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    /* eslint-enable react-hooks/set-state-in-effect */
    const myReq = ++reqIdRef.current
    const reqRef = reqIdRef
    const timer = window.setTimeout(() => {
      if (myReq !== reqRef.current) return
      fsGateway
        .grep(root, query)
        .then((r) => {
          if (myReq !== reqRef.current) return
          setResults(r)
        })
        .catch((e) => {
          if (myReq !== reqRef.current) return
          logger.error("grep failed", e)
          setResults([])
        })
        .finally(() => {
          if (myReq === reqRef.current) setLoading(false)
        })
    }, 200)
    return () => {
      window.clearTimeout(timer)
      reqRef.current++
      setLoading(false)
    }
  }, [root, query, enabled])

  return { results, loading }
}
