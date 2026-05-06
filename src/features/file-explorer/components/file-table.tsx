import { useState, useEffect } from "react"
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, FileText, Folder, FolderOpen, Loader2, Search } from "lucide-react"
import type { SortBy } from "@/features/filesystem/infra/fs.gateway"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { formatSize, formatDate } from "@/shared/lib/format"
import { useFileExplorer } from "../state/explorer-context"
import { useTags } from "@/features/tags/api/tags-context"
import { TagDot } from "@/features/tags/components/tag-dot"
import { FileIcon } from "./file-icon"
import { FileRow } from "./file-row"
import { FileGrid } from "./file-grid"
import { InlineEditInput } from "./inline-edit-input"

const ROW_HEIGHT = 36

export function FileTable() {
  const {
    entries,
    filteredEntries,
    loading,
    error,
    reload,
    filterQuery,
    tableRef,
    inlineMode,
    openContextMenu,
    viewMode,
  } = useFileExplorer()

  const showTable =
    filteredEntries.length > 0 ||
    inlineMode === "newFolder" ||
    inlineMode === "newFile"

  return (
    <div
      ref={tableRef}
      className="flex-1 overflow-auto"
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest("[data-path]")) return
        openContextMenu(e, null)
      }}
    >
      {loading && entries.length === 0 && (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && !loading && (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="rounded-full bg-destructive/10 p-3">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <p className="max-w-md text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={reload}>
            Reintentar
          </Button>
        </div>
      )}

      {!loading &&
        !error &&
        entries.length === 0 &&
        inlineMode !== "newFolder" &&
        inlineMode !== "newFile" && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <FolderOpen className="h-8 w-8 opacity-50" />
            <p className="text-sm">Directorio vacío</p>
          </div>
        )}

      {!loading &&
        !error &&
        entries.length > 0 &&
        filteredEntries.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Search className="h-8 w-8 opacity-50" />
            <p className="text-sm">Sin resultados para "{filterQuery}"</p>
          </div>
        )}

      {!error && showTable && viewMode === "grid" && <FileGrid />}

      {!error && showTable && viewMode === "list" && (
        <VirtualTable />
      )}
    </div>
  )
}

function SortHeader({
  column,
  label,
  align,
  sortBy,
  sortDir,
  onSort,
}: {
  column: SortBy
  label: string
  align: "left" | "right"
  sortBy: SortBy
  sortDir: "asc" | "desc"
  onSort: (c: SortBy) => void
}) {
  const active = sortBy === column
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={`flex w-full items-center gap-1.5 text-xs font-medium tracking-wider uppercase transition-colors hover:text-foreground ${
        active ? "text-foreground" : "text-muted-foreground"
      } ${align === "right" ? "justify-end" : "justify-start"}`}
    >
      <span>{label}</span>
      <Icon className={`h-3 w-3 ${active ? "" : "opacity-50"}`} />
    </button>
  )
}

function VirtualTable() {
  const { getTagsForPath } = useTags()
  const {
    filteredEntries,
    isSelected,
    selectAt,
    selectAll,
    clearSelection,
    selectedPaths,
    tableRef,
    clipboard,
    clipboardHas,
    inlineMode,
    inlineTarget,
    inlineValue,
    setInlineValue,
    commitInline,
    cancelInline,
    handleActivate,
    openContextMenu,
    sortBy,
    sortDir,
    setSortBy,
    setSortDir,
  } = useFileExplorer()

  const [checkboxMode, setCheckboxMode] = useState(false)

  const size = selectedPaths.size
  useEffect(() => {
    if (size === 0) setCheckboxMode(false)
  }, [size])

  // Show row checkboxes only when header checkbox was used or multiple items are selected
  const showCheckboxes = checkboxMode || size > 1

  const allSelected = size > 0 && size >= filteredEntries.length
  const someSelected = size > 0 && size < filteredEntries.length

  const handleSort = (col: SortBy) => {
    if (sortBy === col) {
      setSortDir(sortDir === "asc" ? "desc" : "asc")
    } else {
      setSortBy(col)
      setSortDir(col === "name" ? "asc" : "desc")
    }
  }

  const virtualizer = useVirtualizer({
    count: filteredEntries.length,
    getScrollElement: () => tableRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  const items = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()
  const paddingTop = items.length > 0 ? items[0].start : 0
  const paddingBottom =
    items.length > 0 ? totalSize - items[items.length - 1].end : 0

  return (
    <table className="w-full text-sm" role="grid" aria-multiselectable="true">
      <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
        <tr className="border-b border-border/60">
          <th className="w-10 px-3 py-2 text-center">
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={(checked) => {
                if (checked) {
                  selectAll()
                  setCheckboxMode(true)
                } else {
                  clearSelection()
                  setCheckboxMode(false)
                }
              }}
              aria-label="Seleccionar todo"
              className="shadow-none"
            />
          </th>
          <th className="px-4 py-2 text-left">
            <SortHeader
              column="name"
              label="Nombre"
              align="left"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={handleSort}
            />
          </th>
          <th className="w-28 px-4 py-2 text-right">
            <SortHeader
              column="size"
              label="Tamaño"
              align="right"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={handleSort}
            />
          </th>
          <th className="w-36 px-4 py-2 text-right">
            <SortHeader
              column="modified"
              label="Modificado"
              align="right"
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={handleSort}
            />
          </th>
        </tr>
      </thead>
      <tbody>
        {inlineMode === "newFolder" && (
          <tr className="border-b border-border/30 bg-accent/30">
            <td className="w-10 px-3 py-2" />
            <td className="flex min-w-0 items-center gap-2.5 px-4 py-2">
              <Folder className="h-4 w-4 shrink-0 fill-blue-400/30 text-blue-400" />
              <InlineEditInput
                value={inlineValue}
                onChange={setInlineValue}
                onCommit={commitInline}
                onCancel={cancelInline}
                placeholder="Nueva carpeta"
              />
            </td>
            <td />
            <td />
          </tr>
        )}

        {inlineMode === "newFile" && (
          <tr className="border-b border-border/30 bg-accent/30">
            <td className="w-10 px-3 py-2" />
            <td className="flex min-w-0 items-center gap-2.5 px-4 py-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <InlineEditInput
                value={inlineValue}
                onChange={setInlineValue}
                onCommit={commitInline}
                onCancel={cancelInline}
                placeholder="nombre.extensión"
              />
            </td>
            <td />
            <td />
          </tr>
        )}

        {paddingTop > 0 && (
          <tr aria-hidden style={{ height: paddingTop }}>
            <td colSpan={4} />
          </tr>
        )}

        {items.map((virtualRow) => {
          const entry = filteredEntries[virtualRow.index]
          if (!entry) return null
          const selectedRow = isSelected(entry.path)
          const isRenaming =
            inlineMode === "rename" && inlineTarget === entry.path
          const isCut = clipboard?.op === "cut" && clipboardHas(entry.path)

          return (
            <FileRow
              key={entry.path}
              entry={entry}
              isSelected={selectedRow}
              isCut={isCut}
              isRenaming={isRenaming}
              onClick={(e) => selectAt(entry.path, e)}
              onDoubleClick={() => !isRenaming && handleActivate(entry)}
              onContextMenu={(e) => openContextMenu(e, entry)}
            >
              <td
                className="w-10 px-3 py-2 text-center"
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={selectedRow}
                  onCheckedChange={() =>
                    selectAt(entry.path, { shiftKey: false, metaKey: true, ctrlKey: false })
                  }
                  aria-label={`Seleccionar ${entry.name}`}
                  className={`shadow-none transition-opacity duration-150 ${
                    showCheckboxes ? "opacity-100" : "opacity-0 pointer-events-none"
                  }`}
                />
              </td>
              <td className="flex min-w-0 items-center gap-2.5 px-4 py-2">
                <FileIcon
                  name={entry.name}
                  isDir={entry.is_dir}
                  extension={entry.extension}
                />
                {isRenaming ? (
                  <InlineEditInput
                    value={inlineValue}
                    onChange={setInlineValue}
                    onCommit={commitInline}
                    onCancel={cancelInline}
                    autoSelect
                  />
                ) : (
                  <>
                    <span className="truncate">{entry.name}</span>
                    <span className="flex shrink-0 items-center gap-0.5">
                      {getTagsForPath(entry.path).map((t) => (
                        <TagDot key={t} tagId={t} />
                      ))}
                    </span>
                  </>
                )}
              </td>
              <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">
                {entry.is_dir ? "—" : formatSize(entry.size)}
              </td>
              <td className="px-4 py-2 text-right text-muted-foreground">
                {formatDate(entry.modified)}
              </td>
            </FileRow>
          )
        })}

        {paddingBottom > 0 && (
          <tr aria-hidden style={{ height: paddingBottom }}>
            <td colSpan={4} />
          </tr>
        )}
      </tbody>
    </table>
  )
}
