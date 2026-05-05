import { useEffect, useMemo, useState } from "react"
import { FileQuestion, Loader2 } from "lucide-react"
import { convertFileSrc } from "@tauri-apps/api/core"
import { fsGateway, type Preview } from "@/features/filesystem/infra/fs.gateway"
import { fsErrorMessage } from "@/features/filesystem/domain/fs-error"
import type { FileEntry } from "@/features/filesystem/domain/file-entry"

export type Density = "comfortable" | "compact"

interface Props {
  entry: FileEntry
  density?: Density
}

/**
 * Fetches `preview_file` for the entry and renders the appropriate body
 * (image, audio, video, pdf, text, unsupported).
 *
 * Used by both QuickLook (modal) and PreviewPane (sidebar). The `density`
 * prop adjusts max sizes so the same component can render full-screen or
 * inside a narrow lateral pane.
 */
export function PreviewBody({ entry, density = "comfortable" }: Props) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setPreview(null)
    if (entry.is_dir) {
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    /* eslint-enable react-hooks/set-state-in-effect */
    fsGateway
      .preview(entry.path)
      .then((p) => {
        if (!cancelled) setPreview(p)
      })
      .catch((e) => {
        if (!cancelled) setError(fsErrorMessage(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [entry])

  if (entry.is_dir) {
    return (
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <FileQuestion className="h-10 w-10" />
        <p className="text-sm">Selección de carpeta — sin previsualización</p>
      </div>
    )
  }

  if (loading) {
    return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  }
  if (error) {
    return <p className="text-sm text-destructive">{error}</p>
  }
  if (!preview) return null

  return <PreviewKind preview={preview} path={entry.path} density={density} />
}

function PreviewKind({
  preview,
  path,
  density,
}: {
  preview: Preview
  path: string
  density: Density
}) {
  const assetSrc = useMemo(() => convertFileSrc(path), [path])
  const compact = density === "compact"

  switch (preview.kind) {
    case "image":
      return (
        <img
          src={assetSrc}
          alt=""
          className={
            compact
              ? "max-h-full max-w-full object-contain"
              : "max-h-[70vh] max-w-full object-contain"
          }
        />
      )
    case "audio":
      return <audio controls src={assetSrc} className="w-full max-w-md" />
    case "video":
      return (
        <video
          controls
          src={assetSrc}
          className={compact ? "max-h-full max-w-full" : "max-h-[70vh] max-w-full"}
        />
      )
    case "pdf":
      return (
        <iframe
          src={`${assetSrc}#toolbar=1&view=FitH`}
          className={compact ? "h-full w-full" : "h-[80vh] w-full"}
          title="PDF"
        />
      )
    case "text":
      return (
        <pre
          className={`w-full overflow-auto rounded bg-muted/40 p-3 font-mono whitespace-pre-wrap ${
            compact ? "max-h-full text-[11px]" : "max-h-[70vh] text-xs"
          }`}
        >
          {preview.content}
          {preview.truncated && (
            <span className="mt-3 block text-muted-foreground italic">
              … (contenido truncado)
            </span>
          )}
        </pre>
      )
    case "unsupported":
      return (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <FileQuestion className="h-10 w-10" />
          <p className="text-sm">
            Sin previsualización
            {preview.ext ? ` para .${preview.ext}` : ""}
          </p>
        </div>
      )
  }
}
