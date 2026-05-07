import { useCallback, useState } from "react"
import type { SortBy, SortDir } from "@/features/filesystem/infra/fs.gateway"

const PATH_KEY = "file-explorer:last-path"
const SESSION_KEY = "file-explorer:session"

interface Session {
  panes: Array<{ id: string; path: string }>
  activeId: string
}

export function readSession(): Session | null {
  return readJson<Session | null>(SESSION_KEY, null)
}

export function writeSession(session: Session) {
  writeJson(SESSION_KEY, session)
}
const SORT_KEY = "file-explorer:sort"
const HIDDEN_KEY = "file-explorer:show-hidden"
interface SortPref {
  by: SortBy
  dir: SortDir
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  const raw = window.localStorage.getItem(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function readLastPath(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(PATH_KEY)
}

export function writeLastPath(path: string) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(PATH_KEY, path)
}

export function useSortPref() {
  const [sort, setSort] = useState<SortPref>(() =>
    readJson<SortPref>(SORT_KEY, { by: "name", dir: "asc" })
  )
  const update = useCallback((next: Partial<SortPref>) => {
    setSort((prev) => {
      const merged = { ...prev, ...next }
      writeJson(SORT_KEY, merged)
      return merged
    })
  }, [])
  return {
    sortBy: sort.by,
    sortDir: sort.dir,
    setSortBy: (by: SortBy) => update({ by }),
    setSortDir: (dir: SortDir) => update({ dir }),
  }
}

export function useShowHidden() {
  const [showHidden, setState] = useState<boolean>(() =>
    readJson<boolean>(HIDDEN_KEY, false)
  )
  const setShowHidden = useCallback((v: boolean) => {
    setState(v)
    writeJson(HIDDEN_KEY, v)
  }, [])
  return { showHidden, setShowHidden }
}

