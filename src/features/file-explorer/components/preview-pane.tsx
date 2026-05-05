import { Maximize2, FileQuestion } from "lucide-react"
import { formatSize, formatDate } from "@/shared/lib/format"
import { useFileExplorer } from "../state/explorer-context"
import { PreviewBody } from "./preview-body"

export function PreviewPane() {
  const { entries, selected, openQuickLook } = useFileExplorer()

  const entry = selected ? entries.find((e) => e.path === selected) ?? null : null

  if (!entry) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden p-4 text-center text-muted-foreground">
        <FileQuestion className="h-10 w-10 shrink-0" />
        <p className="w-full text-sm">Seleccioná un archivo para previsualizar</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="flex-1 truncate text-sm font-medium" title={entry.name}>
          {entry.name}
        </span>
        {!entry.is_dir && (
          <button
            onClick={() => openQuickLook(entry)}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="Abrir vista ampliada"
            title="Abrir vista ampliada (Espacio)"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}
      </header>

      <div className="flex flex-1 items-center justify-center overflow-auto p-3">
        <PreviewBody entry={entry} density="compact" />
      </div>

      <footer className="shrink-0 border-t border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate" title={entry.path}>
            {entry.is_dir ? "Carpeta" : entry.extension ? `.${entry.extension}` : "archivo"}
          </span>
          <span className="tabular-nums">
            {!entry.is_dir && entry.size > 0 && formatSize(entry.size)}
            {entry.modified > 0 && ` · ${formatDate(entry.modified)}`}
          </span>
        </div>
      </footer>
    </div>
  )
}
