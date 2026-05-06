/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { X, Folder, File, HardDrive, Loader2 } from "lucide-react"
import { fsGateway } from "@/features/filesystem/infra/fs.gateway"
import { useFileExplorer } from "../state/explorer-context"

interface DiskEntry {
  name: string
  path: string
  is_dir: boolean
  size: number
}

function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`
  return `${bytes} B`
}

interface Props {
  onClose: () => void
}

export function DiskUsagePanel({ onClose }: Props) {
  const { path, onNavigate } = useFileExplorer()
  const [entries, setEntries] = useState<DiskEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fsGateway
      .diskUsage(path)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false))
  }, [path])

  const total = entries.reduce((s, e) => s + e.size, 0)

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="flex w-140 max-w-[90vw] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <HardDrive className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-sm font-medium">{path}</span>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex max-h-[70vh] flex-col overflow-y-auto">
          {loading ? (
            <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Calculando tamaños…
            </div>
          ) : entries.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              Directorio vacío
            </div>
          ) : (
            <ul className="py-1">
              {entries.map((e) => {
                const pct = total > 0 ? (e.size / total) * 100 : 0
                return (
                  <li
                    key={e.path}
                    className="group flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-muted/50"
                    onClick={() => {
                      if (e.is_dir) {
                        onNavigate(e.path)
                        onClose()
                      }
                    }}
                  >
                    {e.is_dir ? (
                      <Folder className="h-4 w-4 shrink-0 fill-blue-400/30 text-blue-400" />
                    ) : (
                      <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {e.name}
                    </span>
                    <div className="flex w-32 shrink-0 items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/60"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-16 text-right font-mono text-xs text-muted-foreground">
                        {formatSize(e.size)}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {!loading && total > 0 && (
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
            <span>{entries.length} elementos</span>
            <span className="font-mono font-medium">
              {formatSize(total)} total
            </span>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
