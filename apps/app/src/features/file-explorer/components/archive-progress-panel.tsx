import { useTranslation } from "react-i18next"
import { Archive, CheckCircle2, PackageOpen, X } from "lucide-react"
import { useArchiveOperations } from "../hooks/use-archive-operations"

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatEta(ms: number, finishing: string): string {
  if (ms < 5_000) return finishing
  if (ms < 60_000) return `~${Math.round(ms / 1_000)} seg`
  if (ms < 3_600_000) return `~${Math.round(ms / 60_000)} min`
  return `~${Math.round(ms / 3_600_000)} h`
}

export function ArchiveProgressPanel() {
  const { t } = useTranslation()
  const { operations, cancel } = useArchiveOperations()

  if (operations.length === 0) return null

  return (
    <div className="fixed right-4 bottom-10 z-50 flex w-72 flex-col gap-2">
      {operations.map((op) => {
        const isCompress = op.operation === "compress"

        if (op.done) {
          return (
            <div key={op.id} className="w-72 rounded-lg border border-border bg-popover p-3 shadow-xl">
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{isCompress ? t("archiveProgress.compressed") : t("archiveProgress.decompressed")}</span>
                </div>
              </div>
              {op.outputName && (
                <p className="mb-2 truncate text-xs text-muted-foreground">{op.outputName}</p>
              )}
              <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-full rounded-full bg-primary" />
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>{t("archiveProgress.completed")}</span>
                <span>100%</span>
              </div>
            </div>
          )
        }

        const Icon = isCompress ? Archive : PackageOpen
        const verb = isCompress ? t("archiveProgress.compressing") : t("archiveProgress.decompressing")
        const hasByteProgress = op.totalBytes > 0
        const percent = hasByteProgress
          ? Math.min(100, Math.round((op.bytesProcessed / op.totalBytes) * 100))
          : op.total > 0
          ? Math.min(100, Math.round((op.current / op.total) * 100))
          : 0
        const indeterminate = !hasByteProgress && (op.total < 0 || op.current === 0)

        return (
          <div key={op.id} className="w-72 rounded-lg border border-border bg-popover p-3 shadow-xl">
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Icon className="h-4 w-4 shrink-0" />
                <span>{verb}</span>
              </div>
              <button
                onClick={() => cancel(op.id)}
                className="rounded p-0.5 transition-colors hover:bg-muted"
                aria-label={t("archiveProgress.cancel")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {op.label ? (
              <p className="mb-2 truncate text-xs text-muted-foreground">{op.label}</p>
            ) : (
              <div className="mb-2" />
            )}

            <div className="mb-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              {indeterminate ? (
                <div className="h-full w-full animate-pulse bg-primary/60 opacity-70" />
              ) : (
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${percent}%` }}
                />
              )}
            </div>

            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>
                {hasByteProgress
                  ? formatBytes(op.bytesProcessed)
                  : indeterminate
                  ? t("archiveProgress.entries", { count: op.current })
                  : `${op.current} / ${op.total}`}
              </span>
              <span>
                {op.etaMs != null && !indeterminate
                  ? formatEta(op.etaMs, t("archiveProgress.finishing"))
                  : !indeterminate || hasByteProgress
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
