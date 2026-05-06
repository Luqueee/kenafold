import { useEffect } from "react"
import { useHotkey, type UseHotkeyOptions } from "@tanstack/react-hotkeys"
import { useAction } from "@/features/hotkeys/bindings"
import type { HotkeyActionId } from "@/features/hotkeys/registry"
import type { FileEntry } from "@/features/filesystem/domain/file-entry"
import { isShellScript } from "@/features/filesystem/domain/file-entry"
import { parentPath } from "@/features/filesystem/domain/path"
import type { ViewMode } from "../hooks/use-view-mode"
import type { InlineMode } from "../hooks/use-inline-editing"
import type { Clipboard } from "@/features/filesystem/domain/clipboard"

interface UseExplorerHotkeysOptions {
  active: boolean
  navEnabled: boolean
  viewMode: ViewMode
  path: string
  selected: string | null
  selEntry: FileEntry | null
  filteredEntries: FileEntry[]
  clipboard: Clipboard | null
  quickLookEntry: FileEntry | null
  inlineMode: InlineMode

  selectedEntries: () => FileEntry[]
  setSelected: (p: string | null) => void
  selectAll: () => void
  setFilterQuery: (q: string) => void
  setDeleteTargets: (entries: FileEntry[]) => void
  setContextMenu: (v: null) => void

  copy: (paths: string[]) => void
  cut: (paths: string[]) => void
  handlePaste: () => Promise<void>
  duplicate: (path: string) => Promise<void>
  copyPathToClipboard: (path: string) => Promise<void>
  reveal: (path: string) => void
  runInTerminal: (path: string) => Promise<void>
  handleActivate: (entry: FileEntry) => void

  inline: {
    inlineMode: InlineMode
    startRename: (entry: FileEntry) => void
    startNewFile: () => void
    startNewFolder: () => void
    cancelInline: () => void
  }

  undoStack: { canUndo: boolean; undo: () => Promise<void> }
  reload: () => void
  setViewMode: (m: ViewMode) => void
  onOpenSettings: () => void
  onNavigate: (path: string) => void
  openQuickLook: (entry: FileEntry) => void
  closeQuickLook: () => void

  selection: { selectedPaths: ReadonlySet<string>; clear: () => void }
  filterRef: React.RefObject<HTMLInputElement | null>
  keyboardHeadRef: React.MutableRefObject<string | null>
  keyboardAnchorRef: React.MutableRefObject<string | null>
  scrollToSelected: (p: string) => void
  moveKeyboardHead: (step: number) => void
  getGridColumns: () => number
}

export function useExplorerHotkeys({
  active,
  navEnabled,
  viewMode,
  path,
  selected,
  selEntry,
  filteredEntries,
  clipboard,
  quickLookEntry,
  inlineMode,
  selectedEntries,
  setSelected,
  selectAll,
  setFilterQuery,
  setDeleteTargets,
  setContextMenu,
  copy,
  cut,
  handlePaste,
  duplicate,
  copyPathToClipboard,
  reveal,
  runInTerminal,
  handleActivate,
  inline,
  undoStack,
  reload,
  setViewMode,
  onOpenSettings,
  onNavigate,
  openQuickLook,
  closeQuickLook,
  selection,
  filterRef,
  keyboardHeadRef,
  keyboardAnchorRef,
  scrollToSelected,
  moveKeyboardHead,
  getGridColumns,
}: UseExplorerHotkeysOptions) {
  // Local helper — valid because it's always called unconditionally at hook top-level
  function useActiveAction(id: HotkeyActionId, fn: (e: KeyboardEvent) => void, opts?: UseHotkeyOptions) {
    useAction(id, fn, { ...opts, enabled: active && (opts?.enabled ?? true) })
  }

  const resetKeyboardRefs = () => {
    keyboardHeadRef.current = null
    keyboardAnchorRef.current = null
  }

  useHotkey("Escape", () => {
    if (inlineMode) return inline.cancelInline()
    if (document.activeElement === filterRef.current) {
      setFilterQuery("")
      filterRef.current?.blur()
      return
    }
    if (selection.selectedPaths.size > 1) selection.clear()
    setContextMenu(null)
    setDeleteTargets([])
  }, { ignoreInputs: false, preventDefault: false })

  useActiveAction("filter.focus", () => {
    filterRef.current?.focus()
  })

  useActiveAction("file.copy", () => {
    const sel = selectedEntries()
    if (sel.length > 0) copy(sel.map((e) => e.path))
  }, { enabled: navEnabled && !!selEntry, ignoreInputs: true })

  useActiveAction("file.cut", () => {
    const sel = selectedEntries()
    if (sel.length > 0) cut(sel.map((e) => e.path))
  }, { enabled: navEnabled && !!selEntry, ignoreInputs: true })

  useActiveAction("file.paste", () => {
    if (clipboard) handlePaste()
  }, { enabled: navEnabled && !!clipboard, ignoreInputs: true })

  useActiveAction("file.rename", () => {
    if (selEntry) inline.startRename(selEntry)
  }, { enabled: navEnabled && !!selEntry })

  useActiveAction("file.delete", () => {
    const sel = selectedEntries()
    if (sel.length > 0) setDeleteTargets(sel)
  }, { enabled: navEnabled && !!selEntry })

  useHotkey("Mod+Backspace", () => {
    const sel = selectedEntries()
    if (sel.length > 0) setDeleteTargets(sel)
  }, { enabled: active && navEnabled && !!selEntry })

  useAction("file.duplicate", () => {
    const sel = selectedEntries()
    for (const entry of sel) duplicate(entry.path)
  }, { enabled: navEnabled && !!selEntry, ignoreInputs: true })

  useAction("file.copyPath", () => {
    if (selEntry) copyPathToClipboard(selEntry.path)
  }, { enabled: navEnabled && !!selEntry, ignoreInputs: true })

  useAction("file.reveal", () => {
    if (selEntry) reveal(selEntry.path)
  }, { enabled: navEnabled && !!selEntry, ignoreInputs: true })

  useAction("file.runInTerminal", () => {
    if (selEntry && isShellScript(selEntry)) runInTerminal(selEntry.path)
  }, {
    enabled: navEnabled && !!selEntry && (selEntry ? isShellScript(selEntry) : false),
    ignoreInputs: true,
  })

  useActiveAction("file.newFile", () => {
    inline.startNewFile()
  }, { enabled: navEnabled, ignoreInputs: true })

  useActiveAction("file.newFolder", () => {
    inline.startNewFolder()
  }, { enabled: navEnabled, ignoreInputs: true })

  useActiveAction("history.undo", async () => {
    await undoStack.undo()
    await reload()
  }, { enabled: undoStack.canUndo, ignoreInputs: true })

  useActiveAction("view.reload", () => {
    reload()
  }, { ignoreInputs: true })

  useActiveAction("view.list", () => {
    setViewMode("list")
  }, { ignoreInputs: true })

  useActiveAction("view.grid", () => {
    setViewMode("grid")
  }, { ignoreInputs: true })

  useActiveAction("view.settings", () => {
    onOpenSettings()
  }, { ignoreInputs: true })

  useActiveAction("view.quickLook", () => {
    if (quickLookEntry) {
      closeQuickLook()
      return
    }
    if (selEntry && !selEntry.is_dir) openQuickLook(selEntry)
  }, { enabled: navEnabled || !!quickLookEntry, ignoreInputs: true })

  useActiveAction("selection.all", () => {
    selectAll()
  }, { enabled: navEnabled, ignoreInputs: true })

  useActiveAction("selection.down", () => {
    if (filteredEntries.length === 0) return
    resetKeyboardRefs()
    const step = viewMode === "grid" ? getGridColumns() : 1
    const idx = selected ? filteredEntries.findIndex((en) => en.path === selected) : -1
    const next = filteredEntries[Math.min(idx + step, filteredEntries.length - 1)]
    if (next) { setSelected(next.path); scrollToSelected(next.path) }
  }, { enabled: navEnabled })

  useActiveAction("selection.up", () => {
    if (filteredEntries.length === 0) return
    resetKeyboardRefs()
    const step = viewMode === "grid" ? getGridColumns() : 1
    const idx = selected ? filteredEntries.findIndex((en) => en.path === selected) : 0
    const prev = filteredEntries[Math.max(idx - step, 0)]
    if (prev) { setSelected(prev.path); scrollToSelected(prev.path) }
  }, { enabled: navEnabled })

  useHotkey("ArrowLeft", () => {
    if (filteredEntries.length === 0) return
    resetKeyboardRefs()
    const idx = selected ? filteredEntries.findIndex((en) => en.path === selected) : 0
    const prev = filteredEntries[Math.max(idx - 1, 0)]
    if (prev && prev.path !== selected) { setSelected(prev.path); scrollToSelected(prev.path) }
  }, { enabled: active && navEnabled && viewMode === "grid" })

  useHotkey("ArrowRight", () => {
    if (filteredEntries.length === 0) return
    resetKeyboardRefs()
    const idx = selected ? filteredEntries.findIndex((en) => en.path === selected) : -1
    const next = filteredEntries[Math.min(idx + 1, filteredEntries.length - 1)]
    if (next && next.path !== selected) { setSelected(next.path); scrollToSelected(next.path) }
  }, { enabled: active && navEnabled && viewMode === "grid" })

  useHotkey("Meta+ArrowDown", () => {
    moveKeyboardHead(1)
  }, { enabled: active && navEnabled && viewMode !== "grid" })

  useHotkey("Meta+ArrowUp", () => {
    moveKeyboardHead(-1)
  }, { enabled: active && navEnabled && viewMode !== "grid" })

  useActiveAction("nav.activate", () => {
    if (selEntry) handleActivate(selEntry)
  }, { enabled: navEnabled && !!selEntry })

  useActiveAction("nav.up", () => {
    const par = parentPath(path)
    if (par) onNavigate(par)
  }, { enabled: navEnabled && viewMode !== "grid" })

  useActiveAction("nav.enter", () => {
    if (selEntry?.is_dir) onNavigate(selEntry.path)
  }, { enabled: navEnabled && viewMode !== "grid" && !!selEntry?.is_dir })

  useEffect(() => {
    if (!active) return
    function onKeyDown(e: KeyboardEvent) {
      if (inlineMode) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key.length !== 1) return
      if (document.activeElement === filterRef.current) return
      const tag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase()
      if (tag === "input" || tag === "textarea") return
      filterRef.current?.focus()
    }
    window.addEventListener("keydown", onKeyDown, { capture: true })
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true })
  }, [active, inlineMode, filterRef])
}
