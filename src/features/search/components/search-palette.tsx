import { useEffect, useMemo, useRef, useState } from "react"
import { Search, FileText, Loader2, CornerDownLeft } from "lucide-react"
import { useGrep, useSearch, useSearchIndex } from "../api/use-search"
import { FileIcon } from "@/features/file-explorer/components/file-icon"
import { formatSize, formatDate } from "@/shared/lib/format"
import type { SearchResult } from "@/features/filesystem/domain/file-entry"
import type { GrepHit } from "@/features/filesystem/infra/fs.gateway"

type Mode = "name" | "content"

interface Props {
  root: string
  open: boolean
  onClose: () => void
  onNavigate: (path: string) => void
  onOpenFile: (path: string) => void
}

export function SearchPalette({
  root,
  open,
  onClose,
  onNavigate,
  onOpenFile,
}: Props) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(0)
  const [mode, setMode] = useState<Mode>("name")
  const listRef = useRef<HTMLDivElement | null>(null)

  const { indexing, size: indexSize } = useSearchIndex(
    root,
    open && mode === "name"
  )
  const { results: nameResults, loading: nameLoading } = useSearch(
    root,
    query,
    open && mode === "name"
  )
  const { results: grepResults, loading: grepLoading } = useGrep(
    root,
    query,
    open && mode === "content"
  )

  const itemCount =
    mode === "name" ? nameResults.length : grepResults.length
  const loading = mode === "name" ? nameLoading : grepLoading

  useEffect(() => {
    if (!open) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setQuery("")
    setSelected(0)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open])

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setSelected(0)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [nameResults, grepResults, mode])

  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      } else if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelected((s) => Math.min(s + 1, Math.max(itemCount - 1, 0)))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelected((s) => Math.max(s - 1, 0))
      } else if (e.key === "Enter") {
        e.preventDefault()
        if (mode === "name") {
          const r = nameResults[selected]
          if (r) handleSelectName(r)
        } else {
          const h = grepResults[selected]
          if (h) handleSelectGrep(h)
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault()
        setMode((m) => (m === "name" ? "content" : "name"))
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, nameResults, grepResults, selected, mode, itemCount])

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const el = list.querySelector<HTMLElement>(`[data-index="${selected}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [selected])

  function handleSelectName(r: SearchResult) {
    if (r.is_dir) onNavigate(r.path)
    else onOpenFile(r.path)
    onClose()
  }

  function handleSelectGrep(h: GrepHit) {
    onOpenFile(h.path)
    onClose()
  }

  if (!open) return null

  const placeholder =
    mode === "name"
      ? indexing
        ? "Indexando..."
        : "Buscar archivos por nombre..."
      : "Buscar texto dentro de archivos..."

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-border/80 bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
          {mode === "name" ? (
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {(loading || (mode === "name" && indexing)) && (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          )}
          <ModeTabs mode={mode} setMode={setMode} />
          <kbd className="hidden shrink-0 rounded border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {!query && mode === "name" && !indexing && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {indexSize != null
                ? `${indexSize.toLocaleString()} archivos indexados. Escribe para buscar.`
                : `Escribe para buscar archivos en ${root}`}
            </div>
          )}
          {!query && mode === "name" && indexing && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Indexando {root}...
            </div>
          )}
          {!query && mode === "content" && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Escribe texto para buscar dentro de archivos en {root}
            </div>
          )}
          {query && !loading && itemCount === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Sin resultados
            </div>
          )}

          {mode === "name" &&
            nameResults.map((r, i) => {
              const parent = r.path.slice(0, r.path.length - r.name.length - 1)
              return (
                <button
                  key={r.path}
                  data-index={i}
                  onClick={() => handleSelectName(r)}
                  onMouseEnter={() => setSelected(i)}
                  className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
                    i === selected
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground"
                  }`}
                >
                  <FileIcon
                    name={r.name}
                    isDir={r.is_dir}
                    extension={r.extension}
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{r.name}</span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {parent || "/"}
                    </span>
                  </div>
                  <div className="ml-2 flex shrink-0 flex-col items-end text-[11px] text-muted-foreground tabular-nums">
                    <span>{r.is_dir ? "carpeta" : formatSize(r.size)}</span>
                    <span>{formatDate(r.modified)}</span>
                  </div>
                </button>
              )
            })}

          {mode === "content" &&
            grepResults.map((h, i) => (
              <GrepRow
                key={`${h.path}:${h.line_number}:${i}`}
                hit={h}
                index={i}
                selected={i === selected}
                onSelect={() => handleSelectGrep(h)}
                onHover={() => setSelected(i)}
              />
            ))}
        </div>

        {itemCount > 0 && (
          <div className="flex items-center justify-between border-t border-border/60 bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
            <span>{itemCount} resultados</span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border/60 bg-background px-1 py-0.5 font-mono">
                  ⌘F
                </kbd>
                cambiar modo
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border/60 bg-background px-1 py-0.5 font-mono">
                  ↑↓
                </kbd>
                navegar
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border/60 bg-background px-1 py-0.5 font-mono">
                  <CornerDownLeft className="h-3 w-3" />
                </kbd>
                abrir
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ModeTabs({
  mode,
  setMode,
}: {
  mode: Mode
  setMode: (m: Mode) => void
}) {
  return (
    <div className="flex shrink-0 overflow-hidden rounded border border-border/60 text-[11px]">
      <button
        onClick={() => setMode("name")}
        className={`px-2 py-0.5 ${
          mode === "name"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Nombre
      </button>
      <button
        onClick={() => setMode("content")}
        className={`px-2 py-0.5 ${
          mode === "content"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Contenido
      </button>
    </div>
  )
}

function GrepRow({
  hit,
  index,
  selected,
  onSelect,
  onHover,
}: {
  hit: GrepHit
  index: number
  selected: boolean
  onSelect: () => void
  onHover: () => void
}) {
  const name = useMemo(() => hit.path.split("/").at(-1) ?? hit.path, [hit.path])
  const parent = useMemo(
    () => hit.path.slice(0, hit.path.length - name.length - 1),
    [hit.path, name]
  )
  const before = hit.line.slice(0, hit.match_start)
  const match = hit.line.slice(hit.match_start, hit.match_end)
  const after = hit.line.slice(hit.match_end)

  return (
    <button
      data-index={index}
      onClick={onSelect}
      onMouseEnter={onHover}
      className={`flex w-full flex-col gap-0.5 px-4 py-2 text-left text-sm ${
        selected ? "bg-accent text-accent-foreground" : "text-foreground"
      }`}
    >
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="truncate font-medium text-foreground">{name}</span>
        <span className="truncate">{parent || "/"}</span>
        <span className="ml-auto shrink-0 tabular-nums">
          :{hit.line_number}
        </span>
      </div>
      <pre className="truncate font-mono text-xs text-muted-foreground">
        {before}
        <mark className="bg-amber-400/30 text-foreground">{match}</mark>
        {after}
      </pre>
    </button>
  )
}
