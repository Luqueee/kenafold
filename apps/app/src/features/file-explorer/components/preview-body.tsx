import { useEffect, useMemo, useRef, useState } from "react"
import { CodePreview } from "./code-preview"
import { ChevronRight, File, FileQuestion, Folder, Loader2 } from "lucide-react"
import { convertFileSrc } from "@tauri-apps/api/core"
import { fsGateway, type ArchiveEntry, type Preview } from "@/features/filesystem/infra/fs.gateway"
import { fsErrorMessage } from "@/features/filesystem/domain/fs-error"
import { isArchive } from "@/features/filesystem/domain/file-entry"
import type { FileEntry } from "@/features/filesystem/domain/file-entry"
import { formatSize } from "@/shared/lib/format"
import { VideoPlayer } from "./video-player"

export type Density = "comfortable" | "compact"

interface Props {
  entry: FileEntry
  density?: Density
}

/**
 * Fetches `preview_file` for the entry and renders the appropriate body
 * (image, audio, video, pdf, text, unsupported, archive).
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
    if (entry.is_dir || isArchive(entry)) {
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

  if (isArchive(entry)) return <ArchivePreview entry={entry} />

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
      return <VideoPlayer src={assetSrc} compact={compact} />
    case "pdf":
      return <PdfPreview src={assetSrc} compact={compact} />
    case "text":
      return (
        <CodePreview
          path={path}
          content={preview.content}
          truncated={preview.truncated}
          compact={compact}
        />
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

function PdfPreview({ src, compact }: { src: string; compact: boolean }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  useEffect(() => {
    return () => {
      if (iframeRef.current) iframeRef.current.src = "about:blank"
    }
  }, [])
  return (
    <iframe
      ref={iframeRef}
      src={`${src}#toolbar=1&view=FitH`}
      className={compact ? "h-full w-full" : "h-[80vh] w-full"}
      title="PDF"
    />
  )
}

// ---------------------------------------------------------------------------
// Archive preview
// ---------------------------------------------------------------------------

interface TreeNode {
  name: string
  fullPath: string
  size: number
  isDir: boolean
  children: TreeNode[]
}

function buildTree(entries: ArchiveEntry[]): TreeNode[] {
  const root: TreeNode[] = []
  const map = new Map<string, TreeNode>()

  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path))

  for (const entry of sorted) {
    const parts = entry.path.split('/')
    let parent = root
    let cum = ''

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (!part) continue
      cum = cum ? `${cum}/${part}` : part
      const isLast = i === parts.length - 1

      let node = map.get(cum)
      if (!node) {
        node = {
          name: part,
          fullPath: cum,
          size: isLast ? entry.size : 0,
          isDir: !isLast || entry.isDir,
          children: [],
        }
        map.set(cum, node)
        parent.push(node)
      }
      parent = node.children
    }
  }

  // Sort each level: dirs first then files, both alphabetically
  function sortLevel(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const n of nodes) sortLevel(n.children)
  }
  sortLevel(root)
  return root
}

function ArchiveTreeNode({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth === 0)

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded py-0.5 text-sm hover:bg-muted/40 ${node.isDir ? 'cursor-pointer' : 'cursor-default'}`}
        style={{ paddingLeft: `${8 + depth * 16}px`, paddingRight: 8 }}
        onClick={() => node.isDir && setOpen((o) => !o)}
      >
        {node.isDir ? (
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
          />
        ) : (
          <span className="h-3.5 w-3.5 shrink-0" />
        )}
        {node.isDir ? (
          <Folder className="h-3.5 w-3.5 shrink-0 fill-blue-400/20 text-blue-400" />
        ) : (
          <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        )}
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {!node.isDir && node.size > 0 && (
          <span className="ml-3 shrink-0 tabular-nums text-xs text-muted-foreground">
            {formatSize(node.size)}
          </span>
        )}
      </div>
      {node.isDir && open && (
        <div>
          {node.children.length > 0
            ? node.children.map((child) => (
                <ArchiveTreeNode key={child.fullPath} node={child} depth={depth + 1} />
              ))
            : (
              <div
                className="py-0.5 text-xs text-muted-foreground/50"
                style={{ paddingLeft: `${8 + (depth + 1) * 16}px` }}
              >
                Carpeta vacía
              </div>
            )}
        </div>
      )}
    </div>
  )
}

function ArchivePreview({ entry }: { entry: FileEntry }) {
  const [entries, setEntries] = useState<ArchiveEntry[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setEntries(null)
    fsGateway
      .listArchive(entry.path)
      .then((list) => { if (!cancelled) setEntries(list) })
      .catch((e) => { if (!cancelled) setError(fsErrorMessage(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [entry.path])

  const tree = useMemo(() => (entries ? buildTree(entries) : []), [entries])

  const stats = useMemo(() => {
    if (!entries) return null
    const files = entries.filter((e) => !e.isDir)
    const dirs = entries.filter((e) => e.isDir)
    const totalSize = files.reduce((s, e) => s + e.size, 0)
    return { files: files.length, dirs: dirs.length, totalSize }
  }, [entries])

  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!entries) return null

  return (
    <div className="flex h-full w-full flex-col gap-3">
      {/* Stats row */}
      {stats && (
        <div className="flex shrink-0 flex-wrap gap-x-4 gap-y-1 border-b border-border/40 pb-2 text-xs text-muted-foreground">
          <span><span className="font-medium text-foreground">{stats.files}</span> archivos</span>
          {stats.dirs > 0 && <span><span className="font-medium text-foreground">{stats.dirs}</span> carpetas</span>}
          {stats.totalSize > 0 && <span>{formatSize(stats.totalSize)} sin comprimir</span>}
        </div>
      )}
      {/* Tree */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tree.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Archivo vacío</p>
        ) : (
          tree.map((node) => <ArchiveTreeNode key={node.fullPath} node={node} depth={0} />)
        )}
      </div>
    </div>
  )
}
