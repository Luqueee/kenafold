import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { X, Copy, Check, Loader2, FileDigit } from "lucide-react"
import { fsGateway } from "@/features/filesystem/infra/fs.gateway"
import type { FileEntry } from "@/features/filesystem/domain/file-entry"

interface Props {
  entry: FileEntry
  onClose: () => void
}

interface Hashes {
  md5: string
  sha1: string
  sha256: string
  size: number
}

function formatSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(2)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`
  return `${bytes} B`
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={copy}
      className="ml-2 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      title="Copiar"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function HashRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-muted/40 px-3 py-2">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-1">
        <span className="flex-1 break-all font-mono text-xs">{value}</span>
        <CopyButton value={value} />
      </div>
    </div>
  )
}

export function HashPanel({ entry, onClose }: Props) {
  const [hashes, setHashes] = useState<Hashes | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fsGateway
      .computeHashes(entry.path)
      .then(setHashes)
      .catch((e) => setError(String(e)))
  }, [entry.path])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex w-[480px] max-w-[95vw] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
          <FileDigit className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-sm font-medium" title={entry.path}>
            {entry.name}
          </span>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-2 p-4">
          {!hashes && !error && (
            <div className="flex h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Calculando hashes…
            </div>
          )}
          {error && (
            <div className="flex h-32 items-center justify-center text-sm text-destructive">
              {error}
            </div>
          )}
          {hashes && (
            <>
              <HashRow label="MD5" value={hashes.md5} />
              <HashRow label="SHA-1" value={hashes.sha1} />
              <HashRow label="SHA-256" value={hashes.sha256} />
            </>
          )}
        </div>

        {hashes && (
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-2 text-xs text-muted-foreground">
            <span>{formatSize(hashes.size)}</span>
            <CopyButton value={`MD5: ${hashes.md5}\nSHA-1: ${hashes.sha1}\nSHA-256: ${hashes.sha256}`} />
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
