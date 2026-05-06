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
import { DndContext, DragOverlay } from "@dnd-kit/core"
import { toast } from "sonner"
import { useDirectory } from "@/features/filesystem/api/use-directory"
import { useDirWatcher } from "@/features/filesystem/api/use-dir-watcher"
import {
  fsGateway,
  type SortBy,
  type SortDir,
} from "@/features/filesystem/infra/fs.gateway"
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
import { tagsGateway } from "@/features/tags/infra/tags.gateway"
import { useExplorerHotkeys } from "../hooks/use-explorer-hotkeys"
import { BulkRenameModal } from "../components/bulk-rename-modal"
import { HashPanel } from "../components/hash-panel"

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
  selectAt: (
    path: string,
    e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }
  ) => void
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
  compress: (paths: string[], format?: string, level?: string) => Promise<void>
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

  tagFilter: string | null

  bulkRenameEntries: FileEntry[] | null
  startBulkRename: (entries: FileEntry[]) => void
  cancelBulkRename: () => void
  commitBulkRename: (renames: Array<{ src: string; newName: string }>) => Promise<void>

  hashPanelEntry: FileEntry | null
  openHashPanel: (entry: FileEntry) => void
  closeHashPanel: () => void
}

const Ctx = createContext<Value | null>(null)

export function useFileExplorer(): Value {
  const v = useContext(Ctx)
  if (!v)
    throw new Error("useFileExplorer must be used inside FileExplorerProvider")
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
  tagFilter?: string | null
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
  tagFilter = null,
  children,
}: ProviderProps) {
  const [taggedEntries, setTaggedEntries] = useState<FileEntry[]>([])
  useEffect(() => {
    if (!tagFilter) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setTaggedEntries([])
      /* eslint-enable react-hooks/set-state-in-effect */
      return
    }
    tagsGateway
      .getEntriesByTag(tagFilter)
      .then(setTaggedEntries)
      .catch(() => setTaggedEntries([]))
  }, [tagFilter])

  const { sortBy, sortDir, setSortBy, setSortDir } = useSortPref()
  const { showHidden, setShowHidden } = useShowHidden()
  const {
    entries,
    loading,
    error,
    reload,
    total,
    hasMore,
    loadMore,
    setEntriesFromPage,
  } = useDirectory(path, sortBy, sortDir)
  const localClipboard = useClipboard()
  const {
    clipboard,
    copy,
    cut,
    clear: clearClipboard,
    hasPath: clipboardHas,
  } = clipboardApi ?? localClipboard
  const undoStack = useUndoStack()
  const ops = useFileOps(reload, undoStack, setEntriesFromPage)

  useDirWatcher(path, reload)

  const selection = useSelection()
  const selected = selection.anchorPath
  const setSelected = selection.replace
  const [filterQuery, setFilterQuery] = useState("")
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [deleteTargets, setDeleteTargets] = useState<FileEntry[]>([])

  const { viewMode, setViewMode } = useViewMode()
  const inline = useInlineEditing(path, entries, ops)

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
    if (tagFilter) return taggedEntries
    const q = filterQuery.trim().toLowerCase()
    return q
      ? visibleEntries.filter((e) => e.name.toLowerCase().includes(q))
      : visibleEntries
  }, [visibleEntries, filterQuery, tagFilter, taggedEntries])

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
  useEffect(() => {
    filteredEntriesRef.current = filteredEntries
  }, [filteredEntries])
  useEffect(() => {
    entriesRef.current = entries
  }, [entries])
  useEffect(() => {
    selectedPathsRef.current = selection.selectedPaths
  }, [selection.selectedPaths])

  const handleActivate = useCallback(
    (entry: FileEntry) => {
      if (entry.is_dir) onNavigate(entry.path)
      else ops.open(entry.path)
    },
    [onNavigate, ops]
  )

  const openContextMenu = useCallback(
    (e: ReactMouseEvent, entry: FileEntry | null) => {
      e.preventDefault()
      e.stopPropagation()
      if (entry) {
        const alreadySelected = selectedPathsRef.current.has(entry.path)
        if (!e.ctrlKey && !alreadySelected) setSelected(entry.path)
      }
      setContextMenu({ x: e.clientX, y: e.clientY, entry })
    },
    [setSelected]
  )

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const handlePaste = useCallback(async () => {
    if (!clipboard) return
    await ops.paste(clipboard, path)
    if (clipboard.op === "cut") clearClipboard()
  }, [clipboard, ops, path, clearClipboard])

  const compress = useCallback(
    async (paths: string[], format?: string, level?: string) => {
      if (paths.length === 0) return
      await ops.compress(paths, path, undefined, format, level)
    },
    [ops, path]
  )

  const decompress = useCallback(
    async (p: string) => {
      try {
        await fsGateway.decompress(p)
        reload()
      } catch (e) {
        toast.error(fsErrorMessage(e))
      }
    },
    [reload]
  )

  const duplicate = useCallback(
    async (p: string) => {
      await ops.duplicate(p)
    },
    [ops]
  )

  const reveal = useCallback(
    (p: string) => {
      ops.reveal(p)
    },
    [ops]
  )

  const copyPathToClipboard = useCallback(async (p: string) => {
    try {
      await navigator.clipboard.writeText(p)
      toast.success("Ruta copiada")
    } catch {
      // Clipboard API unavailable; not critical.
    }
  }, [])

  const runInTerminal = useCallback(
    async (p: string) => {
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
    },
    [terminalId]
  )

  const [quickLookEntry, setQuickLookEntry] = useState<FileEntry | null>(null)
  const openQuickLook = useCallback((e: FileEntry) => setQuickLookEntry(e), [])
  const closeQuickLook = useCallback(() => setQuickLookEntry(null), [])

  const [hashPanelEntry, setHashPanelEntry] = useState<FileEntry | null>(null)
  const openHashPanel = useCallback((e: FileEntry) => setHashPanelEntry(e), [])
  const closeHashPanel = useCallback(() => setHashPanelEntry(null), [])

  const [bulkRenameEntries, setBulkRenameEntries] = useState<FileEntry[] | null>(null)
  const startBulkRename = useCallback((e: FileEntry[]) => setBulkRenameEntries(e), [])
  const cancelBulkRename = useCallback(() => setBulkRenameEntries(null), [])
  const commitBulkRename = useCallback(
    async (renames: Array<{ src: string; newName: string }>) => {
      setBulkRenameEntries(null)
      await ops.renameMany(renames)
    },
    [ops]
  )

  const confirmDelete = useCallback(async () => {
    if (deleteTargets.length === 0) return
    const targets = deleteTargets
    setDeleteTargets([])
    selection.clear()
    await ops.removeMany(targets.map((t) => t.path))
  }, [deleteTargets, ops, selection])

  const selEntry = selected
    ? (entries.find((en) => en.path === selected) ?? null)
    : null

  const selectedEntries = useCallback((): FileEntry[] => {
    const paths = selection.selectedPaths
    if (paths.size === 0) {
      const anchor =
        entriesRef.current.find((en) => en.path === selected) ?? null
      return anchor ? [anchor] : []
    }
    return entriesRef.current.filter((en) => paths.has(en.path))
  }, [selected, selection.selectedPaths])

  const navEnabled =
    !contextMenu && deleteTargets.length === 0 && !inline.inlineMode

  const scrollToSelected = useCallback((p: string) => {
    tableRef.current
      ?.querySelector<HTMLElement>(`[data-path="${CSS.escape(p)}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [])

  const getGridColumns = () => {
    const innerWidth = (tableRef.current?.clientWidth ?? 0) - 24
    return Math.max(1, Math.floor((innerWidth + 8) / 118))
  }

  const moveKeyboardHead = (step: number) => {
    if (filteredEntries.length === 0) return
    if (!keyboardAnchorRef.current) keyboardAnchorRef.current = selected
    const anchor = keyboardAnchorRef.current
    const anchorIdx = anchor
      ? filteredEntries.findIndex((en) => en.path === anchor)
      : 0
    const head = keyboardHeadRef.current ?? anchor
    const headIdx = head
      ? filteredEntries.findIndex((en) => en.path === head)
      : anchorIdx
    const newHeadIdx = Math.max(
      0,
      Math.min(filteredEntries.length - 1, headIdx + step)
    )
    if (newHeadIdx === headIdx) return
    const newHead = filteredEntries[newHeadIdx]
    const extending =
      Math.abs(newHeadIdx - anchorIdx) > Math.abs(headIdx - anchorIdx)
    if (extending) {
      selection.add(newHead.path)
      keyboardHeadRef.current = newHead.path
    } else {
      const currentHead = filteredEntries[headIdx]
      if (currentHead && currentHead.path !== anchor)
        selection.remove(currentHead.path)
      keyboardHeadRef.current = newHead.path === anchor ? null : newHead.path
    }
    scrollToSelected(newHead.path)
  }

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

  useExplorerHotkeys({
    active,
    navEnabled,
    viewMode,
    path,
    selected,
    selEntry,
    filteredEntries,
    clipboard,
    quickLookEntry,
    inlineMode: inline.inlineMode,
    selectedEntries,
    setSelected,
    selectAll,
    setFilterQuery,
    setDeleteTargets,
    setContextMenu: () => setContextMenu(null),
    copy,
    cut,
    handlePaste,
    duplicate,
    copyPathToClipboard,
    reveal,
    runInTerminal,
    handleActivate,
    inline,
    undoStack: {
      canUndo: undoStack.canUndo,
      undo: async () => {
        await undoStack.undo()
        await reload()
      },
    },
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
  })

  const segments = useMemo(() => pathSegments(path), [path])
  const parent = useMemo(() => parentPath(path), [path])
  const dirCount = useMemo(
    () => filteredEntries.filter((e) => e.is_dir).length,
    [filteredEntries]
  )
  const fileCount = filteredEntries.length - dirCount

  const value = useMemo(
    (): Value => ({
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
      tagFilter,
      bulkRenameEntries,
      startBulkRename,
      cancelBulkRename,
      commitBulkRename,
      hashPanelEntry,
      openHashPanel,
      closeHashPanel,
    }),
    [
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
      selection,
      selectAt,
      selectAll,
      filterQuery,
      setFilterQuery,
      clipboard,
      copy,
      cut,
      ops.opError,
      ops.clearError,
      inline.inlineMode,
      inline.inlineTarget,
      inline.inlineValue,
      inline.setInlineValue,
      inline.startRename,
      inline.startNewFolder,
      inline.startNewFile,
      inline.cancelInline,
      inline.commitInline,
      contextMenu,
      openContextMenu,
      closeContextMenu,
      deleteTargets,
      setDeleteTargets,
      confirmDelete,
      clipboardHas,
      dnd.draggingEntry,
      dnd.copyMode,
      viewMode,
      setViewMode,
      terminalId,
      onOpenSettings,
      segments,
      parent,
      dirCount,
      fileCount,
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
      undoStack.canUndo,
      undoStack.peek,
      undo,
      tagFilter,
      bulkRenameEntries,
      startBulkRename,
      cancelBulkRename,
      commitBulkRename,
      hashPanelEntry,
      openHashPanel,
      closeHashPanel,
    ]
  )

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
              <span className="max-w-48 truncate">
                {dnd.draggingEntry.name}
              </span>
              {dnd.copyMode && (
                <span className="ml-1 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  Copiar
                </span>
              )}
            </div>
          )}
        </DragOverlay>
      </DndContext>
      {hashPanelEntry && (
        <HashPanel entry={hashPanelEntry} onClose={closeHashPanel} />
      )}
      {bulkRenameEntries && (
        <BulkRenameModal
          entries={bulkRenameEntries}
          onCommit={commitBulkRename}
          onCancel={cancelBulkRename}
        />
      )}
    </Ctx.Provider>
  )
}
