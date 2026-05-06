import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from "react"
import { useHotkey, type UseHotkeyOptions } from "@tanstack/react-hotkeys"
import { useAction } from "@/features/hotkeys/bindings"
import type { HotkeyActionId } from "@/features/hotkeys/registry"
import { DndContext, DragOverlay } from "@dnd-kit/core"
import { toast } from "sonner"
import { useDirectory } from "@/features/filesystem/api/use-directory"
import { fsGateway, type SortBy, type SortDir } from "@/features/filesystem/infra/fs.gateway"
import { fsErrorMessage } from "@/features/filesystem/domain/fs-error"
import { useFileOps } from "@/features/filesystem/api/use-file-ops"
import { useClipboard } from "@/features/filesystem/api/use-clipboard"

type ClipboardApi = ReturnType<typeof useClipboard>
import {
  pathSegments,
  parentPath,
  type PathSegment,
} from "@/features/filesystem/domain/path"
import type { FileEntry } from "@/features/filesystem/domain/file-entry"
import { isShellScript } from "@/features/filesystem/domain/file-entry"
import { isMacJunk } from "@/features/filesystem/domain/mac-junk"
import type { Clipboard } from "@/features/filesystem/domain/clipboard"
import type { ContextMenuState } from "../types"
import { FileIcon } from "../components/file-icon"
import { useViewMode, type ViewMode } from "../hooks/use-view-mode"
import { useSortPref, useShowHidden } from "../hooks/use-explorer-prefs"
import { useInlineEditing, type InlineMode } from "../hooks/use-inline-editing"
import { useDragDrop } from "../hooks/use-drag-drop"
import { useSelection, modeFromEvent } from "../hooks/use-selection"
import { useUndoStack } from "@/features/filesystem/api/use-undo-stack"
import { describeUndoOp } from "@/features/filesystem/domain/undo-op"

export type { InlineMode, ViewMode }

interface Value {
  path: string
  onNavigate: (path: string) => void
  onBack: () => void
  onForward: () => void
  canBack: boolean
  canForward: boolean
  onOpenSearch: () => void
  onAddFavorite: (path: string) => void
  isFavorite: boolean

  entries: FileEntry[]
  filteredEntries: FileEntry[]
  loading: boolean
  error: string | null
  reload: () => void
  total: number
  hasMore: boolean
  loadMore: () => void

  selected: string | null
  setSelected: (p: string | null) => void
  selectedPaths: ReadonlySet<string>
  isSelected: (path: string) => boolean
  selectAt: (path: string, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void
  selectAll: () => void
  clearSelection: () => void

  filterQuery: string
  setFilterQuery: (q: string) => void
  filterRef: RefObject<HTMLInputElement | null>
  tableRef: RefObject<HTMLDivElement | null>

  clipboard: Clipboard | null
  copy: (paths: string[]) => void
  cut: (paths: string[]) => void
  clipboardHas: (path: string) => boolean

  opError: string | null
  clearOpError: () => void

  inlineMode: InlineMode
  inlineTarget: string | null
  inlineValue: string
  setInlineValue: (v: string) => void
  startRename: (entry: FileEntry) => void
  startNewFolder: () => void
  startNewFile: () => void
  cancelInline: () => void
  commitInline: () => Promise<void>

  contextMenu: ContextMenuState | null
  openContextMenu: (e: ReactMouseEvent, entry: FileEntry | null) => void
  closeContextMenu: () => void

  deleteTargets: FileEntry[]
  setDeleteTargets: (e: FileEntry[]) => void
  confirmDelete: () => Promise<void>

  draggingEntry: FileEntry | null
  dragCopyMode: boolean

  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void

  terminalId: string | null
  onOpenSettings: () => void

  segments: PathSegment[]
  parent: string | null
  dirCount: number
  fileCount: number
  totalCount: number

  handleActivate: (entry: FileEntry) => void
  handlePaste: () => Promise<void>
  compress: (paths: string[]) => Promise<void>
  decompress: (path: string) => Promise<void>
  duplicate: (path: string) => Promise<void>
  reveal: (path: string) => void
  copyPathToClipboard: (path: string) => Promise<void>
  runInTerminal: (path: string) => Promise<void>

  sortBy: SortBy
  sortDir: SortDir
  setSortBy: (s: SortBy) => void
  setSortDir: (d: SortDir) => void

  showHidden: boolean
  setShowHidden: (v: boolean) => void


  quickLookEntry: FileEntry | null
  openQuickLook: (entry: FileEntry) => void
  closeQuickLook: () => void

  canUndo: boolean
  undoLabel: string | null
  undo: () => Promise<void>
}

const Ctx = createContext<Value | null>(null)

export function useFileExplorer(): Value {
  const v = useContext(Ctx)
  if (!v) throw new Error("useFileExplorer must be used inside FileExplorerProvider")
  return v
}

interface ProviderProps {
  path: string
  onNavigate: (path: string) => void
  onBack: () => void
  onForward: () => void
  canBack: boolean
  canForward: boolean
  onOpenSearch: () => void
  onAddFavorite: (path: string) => void
  isFavorite: boolean
  terminalId: string | null
  onOpenSettings: () => void
  active?: boolean
  clipboardApi?: ClipboardApi
  children: ReactNode
}

export function FileExplorerProvider({
  path,
  onNavigate,
  onBack,
  onForward,
  canBack,
  canForward,
  onOpenSearch,
  onAddFavorite,
  isFavorite,
  terminalId,
  onOpenSettings,
  active = true,
  clipboardApi,
  children,
}: ProviderProps) {
  const { sortBy, sortDir, setSortBy, setSortDir } = useSortPref()
  const { showHidden, setShowHidden } = useShowHidden()
  const {
    entries, loading, error, reload, total, hasMore, loadMore, setEntriesFromPage,
  } = useDirectory(path, sortBy, sortDir)
  const localClipboard = useClipboard()
  const { clipboard, copy, cut, clear: clearClipboard, hasPath: clipboardHas } =
    clipboardApi ?? localClipboard
  const undoStack = useUndoStack()
  const ops = useFileOps(reload, undoStack, setEntriesFromPage)

  const selection = useSelection()
  const selected = selection.anchorPath
  const setSelected = selection.replace
  const [filterQuery, setFilterQuery] = useState("")
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [deleteTargets, setDeleteTargets] = useState<FileEntry[]>([])

  const { viewMode, setViewMode } = useViewMode()
  const inline = useInlineEditing(path, entries, ops)

  // Refs let callbacks always see latest data without being in deps → stable references.
  const entriesRef = useRef<readonly FileEntry[]>(entries)
  const selectedPathsRef = useRef<ReadonlySet<string>>(selection.selectedPaths)
  const keyboardHeadRef = useRef<string | null>(null)
  const keyboardAnchorRef = useRef<string | null>(null)

  const dnd = useDragDrop(ops, selectedPathsRef, entriesRef)

  const tableRef = useRef<HTMLDivElement | null>(null)
  const filterRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setSelected(null)
    setFilterQuery("")
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [path, setSelected])

  const visibleEntries = useMemo(
    () =>
      entries.filter((e) => {
        if (isMacJunk(e.name)) return false
        if (!showHidden && e.name.startsWith(".")) return false
        return true
      }),
    [entries, showHidden]
  )

  const filteredEntries = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    if (!q) return visibleEntries
    return visibleEntries.filter((e) => e.name.toLowerCase().includes(q))
  }, [visibleEntries, filterQuery])

  // Destructured to keep effect deps as primitives (pendingSelect) and a stable
  // callback (clearPendingSelect), avoiding the whole `inline` object as a dep.
  const { pendingSelect, clearPendingSelect } = inline
  useEffect(() => {
    if (!pendingSelect || entries.length === 0) return
    const entry = entries.find((e) => e.name === pendingSelect)
    if (entry) {
      clearPendingSelect()
      setSelected(entry.path)
      tableRef.current
        ?.querySelector<HTMLElement>(`[data-path="${CSS.escape(entry.path)}"]`)
        ?.scrollIntoView({ block: "nearest" })
    }
  }, [entries, pendingSelect, clearPendingSelect, setSelected])

  const filteredEntriesRef = useRef(filteredEntries)
  useEffect(() => { filteredEntriesRef.current = filteredEntries }, [filteredEntries])
  useEffect(() => { entriesRef.current = entries }, [entries])
  useEffect(() => { selectedPathsRef.current = selection.selectedPaths }, [selection.selectedPaths])

  const handleActivate = useCallback((entry: FileEntry) => {
    if (entry.is_dir) onNavigate(entry.path)
    else ops.open(entry.path)
  }, [onNavigate, ops])

  const openContextMenu = useCallback((e: ReactMouseEvent, entry: FileEntry | null) => {
    e.preventDefault()
    e.stopPropagation()
    if (entry) {
      // Keep multi-selection when Ctrl is held or entry is already selected.
      const alreadySelected = selectedPathsRef.current.has(entry.path)
      if (!e.ctrlKey && !alreadySelected) setSelected(entry.path)
    }
    setContextMenu({ x: e.clientX, y: e.clientY, entry })
  }, [setSelected])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const handlePaste = useCallback(async () => {
    if (!clipboard) return
    await ops.paste(clipboard, path)
    if (clipboard.op === "cut") clearClipboard()
  }, [clipboard, ops, path, clearClipboard])

  const compress = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return
    await ops.compress(paths, path)
  }, [ops, path])

  const decompress = useCallback(async (p: string) => {
    try {
      await fsGateway.decompress(p)
      reload()
    } catch (e) {
      toast.error(fsErrorMessage(e))
    }
  }, [reload])

  const duplicate = useCallback(async (p: string) => {
    await ops.duplicate(p)
  }, [ops])

  const reveal = useCallback((p: string) => {
    ops.reveal(p)
  }, [ops])

  const copyPathToClipboard = useCallback(async (p: string) => {
    try {
      await navigator.clipboard.writeText(p)
      toast.success("Ruta copiada")
    } catch {
      // Clipboard API unavailable; not critical.
    }
  }, [])

  const runInTerminal = useCallback(async (p: string) => {
    try {
      const outcome = await fsGateway.runInTerminal(p, terminalId)
      if (outcome === "fallback_clipboard") {
        toast.info("Comando copiado al portapapeles", {
          description:
            "Tu terminal no soporta ejecución directa. Pegá y presioná Enter.",
        })
      }
    } catch (e) {
      toast.error("No se pudo ejecutar", { description: fsErrorMessage(e) })
    }
  }, [terminalId])

  const [quickLookEntry, setQuickLookEntry] = useState<FileEntry | null>(null)
  const openQuickLook = useCallback((e: FileEntry) => setQuickLookEntry(e), [])
  const closeQuickLook = useCallback(() => setQuickLookEntry(null), [])

  const confirmDelete = useCallback(async () => {
    if (deleteTargets.length === 0) return
    const targets = deleteTargets
    setDeleteTargets([])
    selection.clear()
    await ops.removeMany(targets.map((t) => t.path))
  }, [deleteTargets, ops, selection])

  const selEntry = selected
    ? entries.find((en) => en.path === selected) ?? null
    : null

  const selectedEntries = useCallback((): FileEntry[] => {
    const paths = selection.selectedPaths
    if (paths.size === 0) {
      const anchor = entriesRef.current.find((en) => en.path === selected) ?? null
      return anchor ? [anchor] : []
    }
    return entriesRef.current.filter((en) => paths.has(en.path))
  }, [selected, selection.selectedPaths])

  const navEnabled = !contextMenu && deleteTargets.length === 0 && !inline.inlineMode

  const scrollToSelected = useCallback((p: string) => {
    tableRef.current
      ?.querySelector<HTMLElement>(`[data-path="${CSS.escape(p)}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [])

  const useActiveAction = (
    id: HotkeyActionId,
    fn: (e: KeyboardEvent) => void,
    opts?: UseHotkeyOptions
  ) => {
    useAction(id, fn, { ...opts, enabled: active && (opts?.enabled ?? true) })
  }

  useHotkey("Escape", () => {
    if (contextMenu) return setContextMenu(null)
    if (deleteTargets.length > 0) return setDeleteTargets([])
    if (inline.inlineMode) return inline.cancelInline()
    if (document.activeElement === filterRef.current) {
      setFilterQuery("")
      filterRef.current?.blur()
      return
    }
    if (selection.selectedPaths.size > 1) selection.clear()
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
    selection.selectAll(filteredEntries.map((en) => en.path))
  }, { enabled: navEnabled, ignoreInputs: true })

  const getGridColumns = () => {
    const innerWidth = (tableRef.current?.clientWidth ?? 0) - 24
    return Math.max(1, Math.floor((innerWidth + 8) / 118))
  }

  const moveKeyboardHead = (step: number) => {
    if (filteredEntries.length === 0) return
    if (!keyboardAnchorRef.current) keyboardAnchorRef.current = selected
    const anchor = keyboardAnchorRef.current
    const anchorIdx = anchor ? filteredEntries.findIndex((en) => en.path === anchor) : 0
    const head = keyboardHeadRef.current ?? anchor
    const headIdx = head ? filteredEntries.findIndex((en) => en.path === head) : anchorIdx
    const newHeadIdx = Math.max(0, Math.min(filteredEntries.length - 1, headIdx + step))
    if (newHeadIdx === headIdx) return
    const newHead = filteredEntries[newHeadIdx]
    const extending = Math.abs(newHeadIdx - anchorIdx) > Math.abs(headIdx - anchorIdx)
    if (extending) {
      selection.add(newHead.path)
      keyboardHeadRef.current = newHead.path
    } else {
      const currentHead = filteredEntries[headIdx]
      if (currentHead && currentHead.path !== anchor) selection.remove(currentHead.path)
      keyboardHeadRef.current = newHead.path === anchor ? null : newHead.path
    }
    scrollToSelected(newHead.path)
  }

  const resetKeyboardRefs = () => {
    keyboardHeadRef.current = null
    keyboardAnchorRef.current = null
  }

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

  // Grid-only: left/right single-item navigation (no Meta)
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

  const segments = useMemo(() => pathSegments(path), [path])
  const parent = useMemo(() => parentPath(path), [path])
  const dirCount = useMemo(() => filteredEntries.filter((e) => e.is_dir).length, [filteredEntries])
  const fileCount = filteredEntries.length - dirCount

  const selectAt = useCallback(
    (p: string, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) =>
      selection.select(p, modeFromEvent(e), filteredEntriesRef.current),
    [selection]
  )
  const selectAll = useCallback(
    () => selection.selectAll(filteredEntriesRef.current.map((en) => en.path)),
    [selection]
  )
  const undo = useCallback(async () => {
    await undoStack.undo()
    await reload()
  }, [undoStack, reload])

  const value = useMemo((): Value => ({
    path,
    onNavigate,
    onBack,
    onForward,
    canBack,
    canForward,
    onOpenSearch,
    onAddFavorite,
    isFavorite,
    entries,
    filteredEntries,
    loading,
    error,
    reload,
    total,
    hasMore,
    loadMore,
    selected,
    setSelected,
    selectedPaths: selection.selectedPaths,
    isSelected: selection.isSelected,
    selectAt,
    selectAll,
    clearSelection: selection.clear,
    filterQuery,
    setFilterQuery,
    filterRef,
    tableRef,
    clipboard,
    copy,
    cut,
    opError: ops.opError,
    clearOpError: ops.clearError,
    inlineMode: inline.inlineMode,
    inlineTarget: inline.inlineTarget,
    inlineValue: inline.inlineValue,
    setInlineValue: inline.setInlineValue,
    startRename: inline.startRename,
    startNewFolder: inline.startNewFolder,
    startNewFile: inline.startNewFile,
    cancelInline: inline.cancelInline,
    commitInline: inline.commitInline,
    contextMenu,
    openContextMenu,
    closeContextMenu,
    deleteTargets,
    setDeleteTargets,
    confirmDelete,
    clipboardHas,
    draggingEntry: dnd.draggingEntry,
    dragCopyMode: dnd.copyMode,
    viewMode,
    setViewMode,
    terminalId,
    onOpenSettings,
    segments,
    parent,
    dirCount,
    fileCount,
    totalCount: entries.length,
    handleActivate,
    handlePaste,
    compress,
    decompress,
    duplicate,
    reveal,
    copyPathToClipboard,
    runInTerminal,
    sortBy,
    sortDir,
    setSortBy,
    setSortDir,
    showHidden,
    setShowHidden,
    quickLookEntry,
    openQuickLook,
    closeQuickLook,
    canUndo: undoStack.canUndo,
    undoLabel: undoStack.peek ? describeUndoOp(undoStack.peek) : null,
    undo,
  }), [
    path, onNavigate, onBack, onForward, canBack, canForward,
    onOpenSearch, onAddFavorite, isFavorite,
    entries, filteredEntries, loading, error, reload, total, hasMore, loadMore,
    selected, setSelected, selection, selectAt, selectAll,
    filterQuery, setFilterQuery, clipboard, copy, cut,
    ops.opError, ops.clearError,
    inline.inlineMode, inline.inlineTarget, inline.inlineValue, inline.setInlineValue,
    inline.startRename, inline.startNewFolder, inline.startNewFile,
    inline.cancelInline, inline.commitInline,
    contextMenu, openContextMenu, closeContextMenu,
    deleteTargets, setDeleteTargets, confirmDelete, clipboardHas,
    dnd.draggingEntry, dnd.copyMode, viewMode, setViewMode,
    terminalId, onOpenSettings, segments, parent, dirCount, fileCount,
    handleActivate, handlePaste, compress, decompress, duplicate, reveal, copyPathToClipboard, runInTerminal,
    sortBy, sortDir, setSortBy, setSortDir,
    showHidden, setShowHidden,
    quickLookEntry, openQuickLook, closeQuickLook,
    undoStack.canUndo, undoStack.peek, undo,
  ])

  return (
    <Ctx.Provider value={value}>
      <DndContext
        sensors={dnd.sensors}
        onDragStart={dnd.handleDragStart}
        onDragEnd={dnd.handleDragEnd}
        onDragCancel={dnd.handleDragCancel}
      >
        {children}
        <DragOverlay>
          {dnd.draggingEntry && (
            <div className="flex w-fit items-center gap-2 rounded-md border border-border bg-popover px-3 py-1.5 text-sm shadow-lg">
              <FileIcon
                name={dnd.draggingEntry.name}
                isDir={dnd.draggingEntry.is_dir}
                extension={dnd.draggingEntry.extension}
              />
              <span className="max-w-48 truncate">{dnd.draggingEntry.name}</span>
              {dnd.copyMode && (
                <span className="ml-1 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  Copiar
                </span>
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </Ctx.Provider>
  )
}
