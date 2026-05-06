import { useCallback, useEffect, useState } from "react"
import { createPortal } from "react-dom"
import {
  X,
  Folder,
  File,
  Trash2,
  RotateCcw,
  Loader2,
  AlertCircle,
  ShieldAlert,
  RefreshCw,
  ExternalLink,
} from "lucide-react"
import { fsGateway } from "@/features/filesystem/infra/fs.gateway"
import type { FileEntry } from "@/features/filesystem/domain/file-entry"
import { Button } from "@/components/ui/button"

type TrashEntry = FileEntry

function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`
  return `${bytes} B`
}

function formatDate(secs: number): string {
  return new Date(secs * 1000).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  })
}

interface Props {
  onClose: () => void
  restorePath: string
  onRestored?: () => void
}

export function TrashPanel({ onClose, restorePath, onRestored }: Props) {
  const [, setTrashDir] = useState<string | null>(null)
  const [entries, setEntries] = useState<TrashEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmEmpty, setConfirmEmpty] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const home = await fsGateway.home()
      const trash = `${home}/.Trash`
      setTrashDir(trash)
      const page = await fsGateway.list(trash, {
        sortBy: "modified",
        sortDir: "desc",
      })
      setEntries(page.entries.filter((e) => !e.name.startsWith(".")))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const restore = async (entry: TrashEntry) => {
    setBusy(entry.name)
    try {
      await fsGateway.move(entry.path, `${restorePath}/${entry.name}`)
      onRestored?.()
      load()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(null)
    }
  }

  const deleteItem = async (entry: TrashEntry) => {
    setBusy(entry.name)
    try {
      await fsGateway.deleteFromTrash(entry.name)
      load()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(null)
    }
  }

  const emptyTrash = async () => {
    setConfirmEmpty(false)
    setLoading(true)
    try {
      await fsGateway.emptyTrash()
      setEntries([])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex h-[70vh] w-140 max-w-[95vw] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-3">
          <Trash2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-sm font-medium">Papelera</span>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando…
            </div>
          )}
          {error &&
            (error.includes("os error 1") ||
            error.includes("Operation not permitted") ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
                <ShieldAlert className="h-10 w-10 text-amber-500" />
                <div>
                  <p className="text-sm font-medium">
                    Se necesita Acceso Total al Disco
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    macOS protege la Papelera. Otorgá permiso en Preferencias
                    del Sistema, luego <strong>reiniciá Kenafold</strong>.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      fsGateway.openUrl(
                        "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
                      )
                    }
                  >
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Abrir Preferencias
                  </Button>
                  <Button variant="ghost" size="sm" onClick={load}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Reintentar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            ))}
          {!loading && !error && entries.length === 0 && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              La papelera está vacía
            </div>
          )}
          {!loading &&
            entries.map((entry) => (
              <div
                key={entry.name}
                className="group flex items-center gap-3 border-b border-border/40 px-4 py-2.5 hover:bg-muted/30"
              >
                {entry.is_dir ? (
                  <Folder className="h-4 w-4 shrink-0 fill-blue-400/30 text-blue-400" />
                ) : (
                  <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{entry.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.is_dir ? "Carpeta" : formatSize(entry.size)} ·{" "}
                    {formatDate(entry.modified)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    disabled={busy === entry.name}
                    onClick={() => restore(entry)}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                    title={`Restaurar en: ${restorePath}`}
                  >
                    {busy === entry.name ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3" />
                    )}
                    Restaurar aquí
                  </button>
                  <button
                    disabled={busy === entry.name}
                    onClick={() => deleteItem(entry)}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    title="Eliminar definitivamente"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t border-border/60 px-4 py-2">
          <span className="text-xs text-muted-foreground">
            {entries.length} elemento{entries.length !== 1 ? "s" : ""}
          </span>
          {confirmEmpty ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">¿Seguro?</span>
              <Button variant="destructive" size="sm" onClick={emptyTrash}>
                Vaciar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmEmpty(false)}
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={entries.length === 0}
              onClick={() => setConfirmEmpty(true)}
            >
              Vaciar papelera
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
