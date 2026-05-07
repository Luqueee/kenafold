import { useCallback, useState } from "react"
import {
  savedSearchesStorage,
  type SavedSearch,
} from "../infra/saved-searches.storage"

export function useSavedSearches() {
  const [searches, setSearches] = useState<SavedSearch[]>(() =>
    savedSearchesStorage.load()
  )

  const add = useCallback((query: string, mode: "name" | "content") => {
    const trimmed = query.trim()
    if (!trimmed) return
    setSearches((prev) => {
      if (prev.some((s) => s.query === trimmed && s.mode === mode)) return prev
      const next = [
        ...prev,
        { id: `${Date.now()}`, query: trimmed, mode },
      ]
      savedSearchesStorage.save(next)
      return next
    })
  }, [])

  const remove = useCallback((id: string) => {
    setSearches((prev) => {
      const next = prev.filter((s) => s.id !== id)
      savedSearchesStorage.save(next)
      return next
    })
  }, [])

  const isSaved = useCallback(
    (query: string, mode: "name" | "content") =>
      searches.some((s) => s.query === query.trim() && s.mode === mode),
    [searches]
  )

  return { searches, add, remove, isSaved }
}
