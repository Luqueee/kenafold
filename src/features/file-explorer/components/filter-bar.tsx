import { useRef, useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { Search, HardDrive, Diff, MoreHorizontal, Trash2 } from "lucide-react"
import { useFileExplorer } from "../state/explorer-context"
import { DiskUsagePanel } from "./disk-usage-panel"
import { FolderComparatorPanel } from "./folder-comparator-panel"
import { TrashPanel } from "./trash-panel"

export function FilterBar() {
  const { filterQuery, setFilterQuery, filterRef, entries, path, reload } = useFileExplorer()
  const [diskUsageOpen, setDiskUsageOpen] = useState(false)
  const [comparatorOpen, setComparatorOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuPos) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuPos(null) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [menuPos])

  if (!filterQuery && entries.length === 0) return null

  const openMenu = () => {
    const rect = btnRef.current?.getBoundingClientRect()
    if (!rect) return
    setMenuPos({ x: rect.right, y: rect.bottom + 4 })
  }

  return (
    <>
      <div className="flex h-9 w-full shrink-0 items-center gap-2 border-b border-border/40 bg-muted/10 pl-2 pr-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
        <input
          ref={filterRef}
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="Filtrar... (/)"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
        />
        {filterQuery && (
          <button
            onClick={() => { setFilterQuery(""); filterRef.current?.focus() }}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        )}
        <button
          ref={btnRef}
          onClick={openMenu}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/60 hover:bg-muted hover:text-foreground"
          title="Herramientas"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>

      {menuPos && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuPos(null)} />
          <div
            className="fixed z-50 min-w-45 rounded-md border border-border bg-popover py-1 shadow-lg"
            style={{ top: menuPos.y, right: window.innerWidth - menuPos.x }}
          >
            <button
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => { setMenuPos(null); setDiskUsageOpen(true) }}
            >
              <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
              Espacio en disco
            </button>
            <button
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => { setMenuPos(null); setComparatorOpen(true) }}
            >
              <Diff className="h-3.5 w-3.5 text-muted-foreground" />
              Comparar carpetas
            </button>
            <button
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => { setMenuPos(null); setTrashOpen(true) }}
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              Papelera
            </button>
          </div>
        </>,
        document.body
      )}

      {diskUsageOpen && <DiskUsagePanel onClose={() => setDiskUsageOpen(false)} />}
      {comparatorOpen && <FolderComparatorPanel onClose={() => setComparatorOpen(false)} />}
      {trashOpen && <TrashPanel onClose={() => setTrashOpen(false)} restorePath={path} onRestored={reload} />}
    </>
  )
}
