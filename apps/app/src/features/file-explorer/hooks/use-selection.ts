import { useCallback, useState } from "react"
import type { FileEntry } from "@/features/filesystem/domain/file-entry"

export type SelectMode = "replace" | "toggle" | "range"

export function modeFromEvent(e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): SelectMode {
  if (e.shiftKey) return "range"
  if (e.metaKey || e.ctrlKey) return "toggle"
  return "replace"
}

export function useSelection() {
  const [selectedPaths, setSelectedPaths] = useState<ReadonlySet<string>>(new Set())
  const [anchorPath, setAnchorPath] = useState<string | null>(null)

  const isSelected = useCallback(
    (path: string) => selectedPaths.has(path),
    [selectedPaths]
  )

  const clear = useCallback(() => {
    setSelectedPaths(new Set())
    setAnchorPath(null)
  }, [])

  const replace = useCallback((path: string | null) => {
    if (!path) {
      setSelectedPaths(new Set())
      setAnchorPath(null)
      return
    }
    setSelectedPaths(new Set([path]))
    setAnchorPath(path)
  }, [])

  const select = useCallback(
    (path: string, mode: SelectMode, ordered: FileEntry[]) => {
      if (mode === "replace") {
        setSelectedPaths(new Set([path]))
        setAnchorPath(path)
        return
      }
      if (mode === "toggle") {
        setSelectedPaths((prev) => {
          const next = new Set(prev)
          if (next.has(path)) next.delete(path)
          else next.add(path)
          return next
        })
        setAnchorPath(path)
        return
      }
      // range
      const anchor = anchorPath ?? path
      const a = ordered.findIndex((e) => e.path === anchor)
      const b = ordered.findIndex((e) => e.path === path)
      if (a < 0 || b < 0) {
        setSelectedPaths(new Set([path]))
        setAnchorPath(path)
        return
      }
      const [lo, hi] = a < b ? [a, b] : [b, a]
      const next = new Set<string>()
      for (let i = lo; i <= hi; i++) next.add(ordered[i].path)
      setSelectedPaths(next)
    },
    [anchorPath]
  )

  const selectAll = useCallback((paths: string[]) => {
    if (paths.length === 0) {
      setSelectedPaths(new Set())
      setAnchorPath(null)
      return
    }
    setSelectedPaths(new Set(paths))
    setAnchorPath(paths[paths.length - 1])
  }, [])

  const add = useCallback((path: string) => {
    setSelectedPaths((prev) => new Set([...prev, path]))
    setAnchorPath(path)
  }, [])

  const remove = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      next.delete(path)
      return next
    })
  }, [])

  return {
    selectedPaths,
    anchorPath,
    isSelected,
    select,
    replace,
    selectAll,
    add,
    remove,
    clear,
  }
}
