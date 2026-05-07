import { useCallback, useEffect, useRef, useState } from "react"
import { fsGateway, type SortBy, type SortDir } from "../infra/fs.gateway"
import type { FileEntry } from "../domain/file-entry"
import { fsErrorMessage } from "../domain/fs-error"
import { logger } from "@/shared/lib/logger"

const PAGE_SIZE = 2_000

interface CacheEntry {
  entries: FileEntry[]
  total: number
}

const dirCache = new Map<string, CacheEntry>()

function cacheKey(path: string, sortBy: SortBy, sortDir: SortDir) {
  return `${path}\0${sortBy}\0${sortDir}`
}

export function useDirectory(path: string, sortBy: SortBy, sortDir: SortDir) {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requestIdRef = useRef(0)

  const load = useCallback(async (p: string, off: number, sb: SortBy, sd: SortDir, skipCache = false) => {
    const id = ++requestIdRef.current
    const key = cacheKey(p, sb, sd)

    // Serve stale cache immediately on first page so navigation feels instant.
    if (off === 0 && !skipCache) {
      const cached = dirCache.get(key)
      if (cached) {
        setEntries(cached.entries)
        setTotal(cached.total)
        setOffset(cached.entries.length)
        setError(null)
        // Revalidate in background — no loading spinner since we already have data.
        const bgId = ++requestIdRef.current
        try {
          const page = await fsGateway.list(p, { limit: PAGE_SIZE, offset: 0, sortBy: sb, sortDir: sd })
          if (requestIdRef.current !== bgId) return
          dirCache.set(key, { entries: page.entries, total: page.total })
          setEntries(page.entries)
          setTotal(page.total)
          setOffset(page.entries.length)
        } catch {
          // Keep stale data on background revalidation failure.
        }
        return
      }
    }

    setLoading(true)
    if (off === 0) setError(null)
    try {
      const page = await fsGateway.list(p, { limit: PAGE_SIZE, offset: off, sortBy: sb, sortDir: sd })
      if (requestIdRef.current !== id) return
      const merged = off === 0 ? page.entries : [...entries, ...page.entries]
      if (off === 0) dirCache.set(key, { entries: page.entries, total: page.total })
      setEntries(merged)
      setTotal(page.total)
      setOffset(off + page.entries.length)
    } catch (e) {
      if (requestIdRef.current !== id) return
      setError(fsErrorMessage(e))
      if (off === 0) setEntries([])
    } finally {
      if (requestIdRef.current === id) setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setOffset(0)
    load(path, 0, sortBy, sortDir)
  }, [path, sortBy, sortDir, load])

  // reload() always bypasses cache (called by watcher on real FS changes).
  const reload = useCallback(() => {
    setOffset(0)
    return load(path, 0, sortBy, sortDir, true)
  }, [path, sortBy, sortDir, load])

  const loadMore = useCallback(() => {
    return load(path, offset, sortBy, sortDir)
  }, [path, offset, sortBy, sortDir, load])

  const hasMore = offset < total

  const setEntriesFromPage = useCallback(
    (fresh: FileEntry[], freshTotal: number) => {
      requestIdRef.current++
      const key = cacheKey(path, sortBy, sortDir)
      dirCache.set(key, { entries: fresh, total: freshTotal })
      setEntries(fresh)
      setTotal(freshTotal)
      setOffset(fresh.length)
      setError(null)
    },
    [path, sortBy, sortDir]
  )

  return {
    entries,
    loading,
    error,
    reload,
    total,
    hasMore,
    loadMore,
    setEntriesFromPage,
  }
}

export function useHomeDir() {
  const [home, setHome] = useState<string | null>(null)
  useEffect(() => {
    fsGateway.home().then(setHome).catch((e) => logger.error("home failed", e))
  }, [])
  return home
}
