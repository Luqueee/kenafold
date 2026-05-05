import { useEffect } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { formatSize } from "@/shared/lib/format"
import type { FileEntry } from "@/features/filesystem/domain/file-entry"
import { PreviewBody } from "./preview-body"

interface Props {
  entry: FileEntry | null
  onClose: () => void
}

export function QuickLook({ entry, onClose }: Props) {
  useEffect(() => {
    if (!entry) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === " ") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [entry, onClose])

  if (!entry) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-[80vw] max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-border/60 px-4 py-2">
          <span className="flex-1 truncate text-sm font-medium">
            {entry.name}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatSize(entry.size)}
          </span>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex flex-1 items-center justify-center overflow-auto p-4">
          <PreviewBody entry={entry} />
        </div>

        <footer className="border-t border-border/60 px-4 py-1.5 text-[11px] text-muted-foreground">
          Espacio o Esc para cerrar
        </footer>
      </div>
    </div>,
    document.body
  )
}
