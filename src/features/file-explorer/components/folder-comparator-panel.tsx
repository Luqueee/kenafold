import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import {
  X,
  Folder,
  File,
  Loader2,
  Hash,
  Check,
  AlertCircle,
  ArrowRight,
} from "lucide-react"
import { fsGateway } from "@/features/filesystem/infra/fs.gateway"
import { useFileExplorer } from "../state/explorer-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type DiffStatus = "identical" | "different" | "only_a" | "only_b"

interface DiffEntry {
  name: string
  status: DiffStatus
  isDir: boolean
  sizeA: number | null
  sizeB: number | null
  mtimeA: number | null
  mtimeB: number | null
  pathA: string | null
  pathB: string | null
}

type FilterMode = "all" | "different" | "only_a" | "only_b"

function formatSize(bytes: number | null): string {
  if (bytes === null) return "—"
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`
  return `${bytes} B`
}

function formatMtime(secs: number | null): string {
  if (secs === null) return "—"
  return new Date(secs * 1000).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
  })
}

const STATUS_BADGE: Record<DiffStatus, { label: string; className: string }> = {
  identical: {
    label: "Idéntico",
    className: "bg-green-500/15 text-green-600 dark:text-green-400",
  },
  different: {
    label: "Distinto",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  only_a: {
    label: "Solo A",
    className: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  },
  only_b: {
    label: "Solo B",
    className: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  },
}

interface HashState {
  loading: boolean
  match: boolean | null
  sha256A: string | null
  sha256B: string | null
}

interface Props {
  onClose: () => void
}

export function FolderComparatorPanel({ onClose }: Props) {
  const { path } = useFileExplorer()

  const [dirA, setDirA] = useState(path)
  const [dirB, setDirB] = useState("")
  const [entries, setEntries] = useState<DiffEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterMode>("all")
  const [hashStates, setHashStates] = useState<Record<string, HashState>>({})
  const dirBRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    dirBRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const compare = async () => {
    if (!dirA || !dirB) return
    setLoading(true)
    setError(null)
    setHashStates({})
    try {
      const result = await fsGateway.compareDirectories(dirA, dirB)
      setEntries(result)
      setFilter("all")
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const computeHash = async (entry: DiffEntry) => {
    if (entry.isDir) return
    setHashStates((prev) => ({
      ...prev,
      [entry.name]: {
        loading: true,
        match: null,
        sha256A: null,
        sha256B: null,
      },
    }))
    try {
      const [hashA, hashB] = await Promise.all([
        entry.pathA ? fsGateway.computeHashes(entry.pathA) : null,
        entry.pathB ? fsGateway.computeHashes(entry.pathB) : null,
      ])
      const sha256A = hashA?.sha256 ?? null
      const sha256B = hashB?.sha256 ?? null
      setHashStates((prev) => ({
        ...prev,
        [entry.name]: {
          loading: false,
          match:
            sha256A !== null && sha256B !== null ? sha256A === sha256B : null,
          sha256A,
          sha256B,
        },
      }))
    } catch {
      setHashStates((prev) => ({
        ...prev,
        [entry.name]: {
          loading: false,
          match: null,
          sha256A: null,
          sha256B: null,
        },
      }))
    }
  }

  const filtered =
    entries?.filter((e) => {
      if (filter === "all") return true
      if (filter === "different") return e.status === "different"
      return e.status === filter
    }) ?? []

  const counts = entries
    ? {
        identical: entries.filter((e) => e.status === "identical").length,
        different: entries.filter((e) => e.status === "different").length,
        only_a: entries.filter((e) => e.status === "only_a").length,
        only_b: entries.filter((e) => e.status === "only_b").length,
      }
    : null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex h-[80vh] w-195 max-w-[95vw] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-3">
          <span className="flex-1 text-sm font-medium">Comparar carpetas</span>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Path inputs */}
        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-3">
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Carpeta A
            </span>
            <Input
              value={dirA}
              onChange={(e) => setDirA(e.target.value)}
              placeholder="/ruta/carpeta-a"
              className="h-8 font-mono text-xs"
              onKeyDown={(e) => e.key === "Enter" && compare()}
            />
          </div>
          <ArrowRight className="mt-5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Carpeta B
            </span>
            <Input
              ref={dirBRef}
              value={dirB}
              onChange={(e) => setDirB(e.target.value)}
              placeholder="/ruta/carpeta-b"
              className="h-8 font-mono text-xs"
              onKeyDown={(e) => e.key === "Enter" && compare()}
            />
          </div>
          <Button
            size="sm"
            className="mt-5 shrink-0"
            onClick={compare}
            disabled={!dirA || !dirB || loading}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Comparar"
            )}
          </Button>
        </div>

        {/* Stats + filter */}
        {counts && (
          <div className="flex shrink-0 items-center gap-1 border-b border-border/60 px-4 py-2">
            {(["all", "different", "only_a", "only_b"] as const).map((f) => {
              const count =
                f === "all" ? entries!.length : counts[f as keyof typeof counts]
              const label =
                f === "all"
                  ? "Todos"
                  : f === "different"
                    ? "Distintos"
                    : f === "only_a"
                      ? "Solo A"
                      : "Solo B"
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                    filter === f
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {label} ({count})
                </button>
              )
            })}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {!entries && !loading && !error && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Ingresá dos rutas y presioná Comparar
            </div>
          )}
          {error && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
          {loading && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Comparando…
            </div>
          )}
          {!loading && entries && filtered.length === 0 && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Sin resultados para este filtro
            </div>
          )}
          {!loading && filtered.length > 0 && (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-popover">
                <tr className="border-b border-border/60 text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Nombre</th>
                  <th className="px-2 py-2 font-medium">Estado</th>
                  <th className="px-2 py-2 text-right font-medium">Tamaño A</th>
                  <th className="px-2 py-2 text-right font-medium">Tamaño B</th>
                  <th className="px-2 py-2 font-medium">Modificado A</th>
                  <th className="px-2 py-2 font-medium">Modificado B</th>
                  <th className="px-2 py-2 font-medium">Hash</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => {
                  const badge = STATUS_BADGE[entry.status]
                  const hs = hashStates[entry.name]
                  const sizeDiff =
                    entry.sizeA !== null &&
                    entry.sizeB !== null &&
                    entry.sizeA !== entry.sizeB
                  const mtimeDiff =
                    entry.mtimeA !== null &&
                    entry.mtimeB !== null &&
                    entry.mtimeA !== entry.mtimeB
                  return (
                    <tr
                      key={entry.name}
                      className="border-b border-border/40 hover:bg-muted/40"
                    >
                      <td className="flex items-center gap-1.5 px-3 py-1.5">
                        {entry.isDir ? (
                          <Folder className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                        ) : (
                          <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="max-w-45 truncate">{entry.name}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right font-mono ${sizeDiff ? "text-amber-500" : ""}`}
                      >
                        {formatSize(entry.sizeA)}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right font-mono ${sizeDiff ? "text-amber-500" : ""}`}
                      >
                        {formatSize(entry.sizeB)}
                      </td>
                      <td
                        className={`px-2 py-1.5 ${mtimeDiff ? "text-amber-500" : "text-muted-foreground"}`}
                      >
                        {formatMtime(entry.mtimeA)}
                      </td>
                      <td
                        className={`px-2 py-1.5 ${mtimeDiff ? "text-amber-500" : "text-muted-foreground"}`}
                      >
                        {formatMtime(entry.mtimeB)}
                      </td>
                      <td className="px-2 py-1.5">
                        {!entry.isDir &&
                          entry.status !== "only_a" &&
                          entry.status !== "only_b" &&
                          (hs?.loading ? (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          ) : hs?.match !== null && hs?.match !== undefined ? (
                            hs.match ? (
                              <Check
                                className="h-3.5 w-3.5 text-green-500"
                                aria-label="Hash idéntico"
                              />
                            ) : (
                              <AlertCircle
                                className="h-3.5 w-3.5 text-destructive"
                                aria-label="Hash distinto"
                              />
                            )
                          ) : (
                            <button
                              onClick={() => computeHash(entry)}
                              className="text-muted-foreground hover:text-foreground"
                              title="Calcular hash SHA256"
                            >
                              <Hash className="h-3.5 w-3.5" />
                            </button>
                          ))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {entries && (
          <div className="flex shrink-0 items-center justify-between border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
            <span>{entries.length} entradas comparadas</span>
            <span>
              {counts!.identical} idénticas · {counts!.different} distintas ·{" "}
              {counts!.only_a} solo A · {counts!.only_b} solo B
            </span>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
