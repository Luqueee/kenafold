import { useEffect, useRef, useState } from "react"
import {
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import type { FileEntry } from "@/features/filesystem/domain/file-entry"
import { joinPath } from "@/features/filesystem/domain/path"

interface Ops {
  move: (src: string, dest: string) => Promise<void>
  copy: (src: string, dest: string) => Promise<void>
}

export function useDragDrop(
  ops: Ops,
  selectedPathsRef: React.RefObject<ReadonlySet<string>>,
  entriesRef: React.RefObject<readonly FileEntry[]>
) {
  const [draggingEntry, setDraggingEntry] = useState<FileEntry | null>(null)
  const [copyMode, setCopyMode] = useState(false)
  const isDraggingRef = useRef(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!isDraggingRef.current) return
      setCopyMode(e.altKey || e.ctrlKey)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("keyup", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("keyup", onKey)
    }
  }, [])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  )

  function handleDragStart(event: DragStartEvent) {
    const entry = event.active.data.current?.entry as FileEntry | undefined
    if (entry) {
      setDraggingEntry(entry)
      isDraggingRef.current = true
      setCopyMode(false)
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const wasCopy = copyMode
    setDraggingEntry(null)
    setCopyMode(false)
    isDraggingRef.current = false

    const { active, over } = event
    if (!over) return
    const src = active.data.current?.entry as FileEntry | undefined
    if (!src) return

    const destDir = (() => {
      const navPath = over.data.current?.navPath as string | undefined
      if (navPath) return navPath
      const destEntry = over.data.current?.entry as FileEntry | undefined
      if (destEntry?.is_dir) return destEntry.path
      return null
    })()
    if (!destDir) return

    // If the dragged entry is part of the current selection, operate on the
    // whole selection. Otherwise just move/copy the dragged entry.
    const selected = selectedPathsRef.current ?? new Set<string>()
    const draggingMulti = selected.size > 1 && selected.has(src.path)
    const targets: FileEntry[] = draggingMulti
      ? (entriesRef.current ?? []).filter((e) => selected.has(e.path))
      : [src]

    for (const t of targets) {
      if (t.path === destDir) continue
      if (destDir.startsWith(t.path + "/")) continue
      const dest = joinPath(destDir, t.name)
      if (dest === t.path) continue
      try {
        if (wasCopy) await ops.copy(t.path, dest)
        else await ops.move(t.path, dest)
      } catch {
        // ops surface their own errors via opError; keep iterating.
      }
    }
  }

  function handleDragCancel() {
    setDraggingEntry(null)
    setCopyMode(false)
    isDraggingRef.current = false
  }

  return {
    draggingEntry,
    copyMode,
    sensors,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
  }
}
