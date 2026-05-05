import { useCallback, useEffect, useState } from "react"
import type { FileEntry } from "@/features/filesystem/domain/file-entry"

export type InlineMode = null | "rename" | "newFolder" | "newFile"

interface Ops {
  rename: (src: string, name: string) => Promise<void>
  mkdir: (parent: string, name: string) => Promise<void>
  mkfile: (parent: string, name: string) => Promise<void>
}

export function useInlineEditing(path: string, entries: FileEntry[], ops: Ops) {
  const [inlineMode, setInlineMode] = useState<InlineMode>(null)
  const [inlineTarget, setInlineTarget] = useState<string | null>(null)
  const [inlineValue, setInlineValue] = useState("")
  const [pendingSelect, setPendingSelect] = useState<string | null>(null)
  const clearPendingSelect = useCallback(() => setPendingSelect(null), [])

  // Reset inline editing state when navigating to a different directory.
  // setState-in-effect is the simplest expression here — clears are conditional
  // on a prop transition, not derivable at render-time without a ref antipattern.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setInlineMode(null)
    setInlineTarget(null)
    setInlineValue("")
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [path])

  function startRename(entry: FileEntry) {
    setInlineMode("rename")
    setInlineTarget(entry.path)
    setInlineValue(entry.name)
  }
  function startNewFolder() {
    setInlineMode("newFolder")
    setInlineTarget(null)
    setInlineValue("")
  }
  function startNewFile() {
    setInlineMode("newFile")
    setInlineTarget(null)
    setInlineValue("")
  }
  function cancelInline() {
    setInlineMode(null)
    setInlineTarget(null)
    setInlineValue("")
  }

  async function commitInline() {
    const trimmed = inlineValue.trim()
    if (!trimmed) {
      cancelInline()
      return
    }
    if (inlineMode === "rename" && inlineTarget) {
      const entry = entries.find((e) => e.path === inlineTarget)
      if (!entry || trimmed === entry.name) {
        cancelInline()
        return
      }
      // Stash the new name so the explorer can re-select the renamed file
      // once the directory listing comes back with the new entry.
      setPendingSelect(trimmed)
      await ops.rename(inlineTarget, trimmed)
    } else if (inlineMode === "newFolder") {
      setPendingSelect(trimmed)
      await ops.mkdir(path, trimmed)
    } else if (inlineMode === "newFile") {
      setPendingSelect(trimmed)
      await ops.mkfile(path, trimmed)
    }
    cancelInline()
  }

  return {
    inlineMode,
    inlineTarget,
    inlineValue,
    setInlineValue,
    startRename,
    startNewFolder,
    startNewFile,
    cancelInline,
    commitInline,
    pendingSelect,
    clearPendingSelect,
  }
}
