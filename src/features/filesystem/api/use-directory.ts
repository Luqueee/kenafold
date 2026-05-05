import { useCallback, useEffect, useRef, useState } from "react"
import { fsGateway, type SortBy, type SortDir } from "../infra/fs.gateway"
import type { FileEntry } from "../domain/file-entry"
import { fsErrorMessage } from "../domain/fs-error"
import { logger } from "@/shared/lib/logger"

const PAGE_SIZE = 2_000

export function useDirectory(path: string, sortBy: SortBy, sortDir: SortDir) {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // requestId tags every in-flight load(); responses with a stale id are dropped,
  // so navigating mid-loadMore can't append entries from the previous directory.
  const requestIdRef = useRef(0)

  const load = useCallback(async (p: string, off: number, sb: SortBy, sd: SortDir) => {
    const id = ++requestIdRef.current
    setLoading(true)
    if (off === 0) setError(null)
    try {
      const page = await fsGateway.list(p, { limit: PAGE_SIZE, offset: off, sortBy: sb, sortDir: sd })
      if (requestIdRef.current !== id) return
      setEntries((prev) => off === 0 ? page.entries : [...prev, ...page.entries])
      setTotal(page.total)
      setOffset(off + page.entries.length)
    } catch (e) {
      if (requestIdRef.current !== id) return
      setError(fsErrorMessage(e))
      if (off === 0) setEntries([])
    } finally {
      if (requestIdRef.current === id) setLoading(false)
    }
  }, [])

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setOffset(0)
    load(path, 0, sortBy, sortDir)
  }, [path, sortBy, sortDir, load])

  const reload = useCallback(() => {
    setOffset(0)
    return load(path, 0, sortBy, sortDir)
  }, [path, sortBy, sortDir, load])

  const loadMore = useCallback(() => {
    return load(path, offset, sortBy, sortDir)
  }, [path, offset, sortBy, sortDir, load])

  const hasMore = offset < total

  /** Inject entries directly from a batch op result — skips a reload() IPC call.
   *  Bumps the requestId so any in-flight load() is cancelled; otherwise a stale
   *  page could land after this and revert the freshly-renamed listing. */
  const setEntriesFromPage = useCallback(
    (fresh: FileEntry[], freshTotal: number) => {
      requestIdRef.current++
      setEntries(fresh)
      setTotal(freshTotal)
      setOffset(fresh.length)
      setError(null)
    },
    []
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
