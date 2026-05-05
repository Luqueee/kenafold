import { FileText, Folder } from "lucide-react"
import { useFileExplorer } from "../state/explorer-context"
import { FileIcon } from "./file-icon"
import { FileTile } from "./file-tile"
import { InlineEditInput } from "./inline-edit-input"
import { formatSize } from "@/shared/lib/format"

export function FileGrid() {
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
  } = useFileExplorer()

  return (
    <div
      className="grid gap-2 p-3"
      role="listbox"
      aria-multiselectable="true"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
      }}
    >
      {inlineMode === "newFolder" && (
        <div className="flex flex-col items-center gap-2 rounded-md border border-border/60 bg-accent/30 p-3">
          <Folder className="h-12 w-12 fill-blue-400/30 text-blue-400" />
          <InlineEditInput
            value={inlineValue}
            onChange={setInlineValue}
            onCommit={commitInline}
            onCancel={cancelInline}
            placeholder="Nueva carpeta"
          />
        </div>
      )}

      {inlineMode === "newFile" && (
        <div className="flex flex-col items-center gap-2 rounded-md border border-border/60 bg-accent/30 p-3">
          <FileText className="h-12 w-12 text-muted-foreground" />
          <InlineEditInput
            value={inlineValue}
            onChange={setInlineValue}
            onCommit={commitInline}
            onCancel={cancelInline}
            placeholder="nombre.extensión"
          />
        </div>
      )}

      {filteredEntries.map((entry) => {
        const selectedTile = isSelected(entry.path)
        const isRenaming =
          inlineMode === "rename" && inlineTarget === entry.path
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
}
