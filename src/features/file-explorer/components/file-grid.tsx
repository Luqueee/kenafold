import { FileText, Folder } from "lucide-react"
import { useState, useEffect } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { useFileExplorer } from "../state/explorer-context"
import { FileIcon } from "./file-icon"
import { FileTile } from "./file-tile"
import { InlineEditInput } from "./inline-edit-input"
import { formatSize } from "@/shared/lib/format"
import type { FileEntry } from "@/features/filesystem/domain/file-entry"

type GridItem =
  | { kind: "newFolder" }
  | { kind: "newFile" }
  | { kind: "entry"; entry: FileEntry }

const TILE_MIN_W = 110
const GAP = 8
const TILE_STEP = TILE_MIN_W + GAP
const TILE_H = 136
const PADDING = 12

export function FileGrid() {
  "use no memo"
  const {
    filteredEntries,
    isSelected,
    selectAt,
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
    tableRef,
  } = useFileExplorer()

  const [cols, setCols] = useState(4)

  useEffect(() => {
    const el = tableRef.current
    if (!el) return
    const update = () => {
      const inner = el.clientWidth - PADDING * 2
      setCols(Math.max(1, Math.floor((inner + GAP) / TILE_STEP)))
    }
    update()
    const obs = new ResizeObserver(update)
    obs.observe(el)
    return () => obs.disconnect()
  }, [tableRef])

  const items: GridItem[] = []
  if (inlineMode === "newFolder") items.push({ kind: "newFolder" })
  if (inlineMode === "newFile") items.push({ kind: "newFile" })
  for (const entry of filteredEntries) items.push({ kind: "entry", entry })

  const rowCount = Math.max(1, Math.ceil(items.length / cols))

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => tableRef.current,
    estimateSize: () => TILE_H + GAP,
    overscan: 3,
  })

  const virtualRows = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()

  return (
    <div
      role="listbox"
      aria-multiselectable="true"
      style={{ height: totalSize + PADDING * 2, position: "relative" }}
    >
      {virtualRows.map((vRow) => {
        const rowItems = items.slice(vRow.index * cols, (vRow.index + 1) * cols)
        return (
          <div
            key={vRow.key}
            style={{
              position: "absolute",
              top: vRow.start + PADDING,
              left: PADDING,
              right: PADDING,
              height: TILE_H,
              display: "grid",
              gap: GAP,
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
            }}
          >
            {rowItems.map((item) => {
              if (item.kind === "newFolder") {
                return (
                  <div
                    key="__newFolder"
                    className="flex flex-col items-center gap-2 rounded-md border border-border/60 bg-accent/30 p-3"
                  >
                    <Folder className="h-12 w-12 fill-blue-400/30 text-blue-400" />
                    <InlineEditInput
                      value={inlineValue}
                      onChange={setInlineValue}
                      onCommit={commitInline}
                      onCancel={cancelInline}
                      placeholder="Nueva carpeta"
                    />
                  </div>
                )
              }
              if (item.kind === "newFile") {
                return (
                  <div
                    key="__newFile"
                    className="flex flex-col items-center gap-2 rounded-md border border-border/60 bg-accent/30 p-3"
                  >
                    <FileText className="h-12 w-12 text-muted-foreground" />
                    <InlineEditInput
                      value={inlineValue}
                      onChange={setInlineValue}
                      onCommit={commitInline}
                      onCancel={cancelInline}
                      placeholder="nombre.extensión"
                    />
                  </div>
                )
              }

              const { entry } = item
              const selectedTile = isSelected(entry.path)
              const isRenaming = inlineMode === "rename" && inlineTarget === entry.path
              const isCut = clipboard?.op === "cut" && clipboardHas(entry.path)

              return (
                <FileTile
                  key={entry.path}
                  entry={entry}
                  isSelected={selectedTile}
                  isCut={isCut}
                  isRenaming={isRenaming}
                  onClick={(e) => selectAt(entry.path, e)}
                  onDoubleClick={() => !isRenaming && handleActivate(entry)}
                  onContextMenu={(e) => openContextMenu(e, entry)}
                >
                  <FileIcon
                    name={entry.name}
                    isDir={entry.is_dir}
                    extension={entry.extension}
                    size={48}
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
                      <span className="line-clamp-2 w-full break-all text-center text-xs">
                        {entry.name}
                      </span>
                      {!entry.is_dir && entry.size > 0 && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {formatSize(entry.size)}
                        </span>
                      )}
                    </>
                  )}
                </FileTile>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
