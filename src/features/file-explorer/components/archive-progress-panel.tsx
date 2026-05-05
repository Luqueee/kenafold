import { Archive, PackageOpen, X } from "lucide-react"
import { useArchiveOperations } from "../hooks/use-archive-operations"

// ---------------------------------------------------------------------------
// ETA formatter
// ---------------------------------------------------------------------------

function formatEta(ms: number): string {
  if (ms < 5_000) return "terminando..."
  if (ms < 60_000) return `~${Math.round(ms / 1_000)} seg`
  if (ms < 3_600_000) return `~${Math.round(ms / 60_000)} min`
  return `~${Math.round(ms / 3_600_000)} h`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ArchiveProgressPanel() {
  const { operations, cancel } = useArchiveOperations()

  if (operations.length === 0) return null

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 w-72">
      {operations.map((op) => {
        const isCompress = op.operation === "compress"
        const Icon = isCompress ? Archive : PackageOpen
        const verb = isCompress ? "Comprimiendo" : "Descomprimiendo"
        const percent =
          op.total > 0 ? Math.min(100, Math.round((op.current / op.total) * 100)) : 0
        const indeterminate = op.total === -1

        return (
          <div
            key={op.id}
            className="bg-popover border border-border rounded-lg shadow-xl p-3 w-72"
          >
            {/* Header row */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Icon className="w-4 h-4 shrink-0" />
                <span>{verb}</span>
              </div>
              <button
                onClick={() => cancel(op.id)}
                className="rounded p-0.5 hover:bg-muted transition-colors"
                aria-label="Cancelar"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Label row */}
            {op.label ? (
              <p className="text-xs text-muted-foreground truncate mb-2">
                {op.label}
              </p>
            ) : (
              <div className="mb-2" />
            )}

            {/* Progress bar */}
            <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1.5">
              {indeterminate ? (
                <div className="h-full w-full bg-primary/60 animate-pulse opacity-70" />
              ) : (
                <div
                  className="h-full bg-primary rounded-full transition-[width] duration-300"
                  style={{ width: `${percent}%` }}
                />
              )}
            </div>

            {/* Stats row */}
            <div className="text-[11px] text-muted-foreground flex justify-between">
              <span>
                {indeterminate
                  ? `${op.current} entradas`
                  : `${op.current} / ${op.total}`}
              </span>
              <span>
                {!indeterminate && op.etaMs != null
                  ? formatEta(op.etaMs)
                  : !indeterminate
                    ? `${percent}%`
                    : null}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
