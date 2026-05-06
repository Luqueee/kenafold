import { useEffect, useRef, useState } from "react"
import { DiskUsagePanel } from "./disk-usage-panel"
import { useDroppable } from "@dnd-kit/core"
import { useAction } from "@/features/hotkeys/bindings"
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Eye,
  EyeOff,
  HardDrive,
  LayoutGrid,
  List,
  Pencil,
  RefreshCw,
  Search,
  Settings,
  Star,
  Terminal,
} from "lucide-react"
import { fsGateway } from "@/features/filesystem/infra/fs.gateway"
import { logger } from "@/shared/lib/logger"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import type { PathSegment } from "@/features/filesystem/domain/path"
import { useFileExplorer } from "../state/explorer-context"

function DroppableUpButton({
  parent,
  isDragging,
  onNavigate,
}: {
  parent: string | null
  isDragging: boolean
  onNavigate: (path: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: "nav-up",
    data: { navPath: parent },
    disabled: !parent,
  })

  return (
    <div ref={setNodeRef} className="rounded-md">
      <Button
        variant="ghost"
        size="icon"
        disabled={!parent}
        onClick={() => parent && onNavigate(parent)}
        title="Subir directorio"
        className={`h-8 w-8 transition-colors ${
          isOver
            ? "bg-primary/15 ring-2 ring-primary"
            : isDragging && parent
              ? "ring-dashed ring-1 ring-muted-foreground/50"
              : ""
        }`}
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
    </div>
  )
}

function DroppableBreadcrumbLink({
  seg,
  isDragging,
  onNavigate,
}: {
  seg: PathSegment
  isDragging: boolean
  onNavigate: (path: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `nav-seg-${seg.path}`,
    data: { navPath: seg.path },
  })

  return (
    <span
      ref={setNodeRef}
      onClick={(e) => {
        e.stopPropagation()
        onNavigate(seg.path)
      }}
      className={`cursor-pointer rounded px-1 py-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground ${
        isOver
          ? "bg-primary/15 text-foreground ring-1 ring-primary"
          : isDragging
            ? "ring-dashed ring-1 ring-muted-foreground/40"
            : ""
      }`}
    >
      {seg.label}
    </span>
  )
}

export function Toolbar() {
  const {
    segments,
    parent,
    loading,
    isFavorite,
    draggingEntry,
    onNavigate,
    onBack,
    onForward,
    canBack,
    canForward,
    reload,
    onAddFavorite,
    onOpenSearch,
    path,
    viewMode,
    setViewMode,
    showHidden,
    setShowHidden,
    terminalId,
    onOpenSettings,
  } = useFileExplorer()
  const isDragging = draggingEntry !== null

  const [diskUsageOpen, setDiskUsageOpen] = useState(false)
  const [editingPath, setEditingPath] = useState(false)
  const [pathDraft, setPathDraft] = useState("")
  const pathInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (editingPath) {
      pathInputRef.current?.focus()
      pathInputRef.current?.select()
    }
  }, [editingPath])

  async function startPathEdit() {
    setPathDraft(path)
    setEditingPath(true)
    try {
      await navigator.clipboard.writeText(path)
    } catch {
      // Clipboard API unavailable (no permission, non-secure context); not critical.
    }
  }

  function commitPathEdit() {
    const trimmed = pathDraft.trim()
    setEditingPath(false)
    if (trimmed && trimmed !== path) onNavigate(trimmed)
  }

  function openTerminal() {
    fsGateway.openTerminal(path, terminalId).catch((e) => logger.error("openTerminal failed", e))
  }

  useAction("view.editPath", startPathEdit, { ignoreInputs: true })
  useAction("view.terminal", openTerminal, { ignoreInputs: true })

  return (
    <>
    <header
      data-tauri-drag-region
      className="flex h-12 w-full shrink-0 items-center gap-1 border-b border-border/60 bg-background/95 pl-2 pr-3 backdrop-blur"
    >
      <SidebarTrigger className="h-8 w-8" />
      <Separator orientation="vertical" className="mx-1 h-full" />

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onBack}
        disabled={!canBack}
        title="Atrás (⌘[)"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onForward}
        disabled={!canForward}
        title="Adelante (⌘])"
      >
        <ArrowRight className="h-4 w-4" />
      </Button>
      <DroppableUpButton
        parent={parent}
        isDragging={isDragging}
        onNavigate={onNavigate}
      />

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={reload}
        title="Actualizar"
        disabled={loading}
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => onAddFavorite(path)}
        disabled={isFavorite}
        title={isFavorite ? "Ya está en favoritos" : "Agregar a favoritos"}
      >
        <Star
          className={`h-4 w-4 ${isFavorite ? "fill-amber-400 text-amber-400" : ""}`}
        />
      </Button>
      <Separator orientation="vertical" className="mx-1 h-full" />

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={startPathEdit}
        title="Copiar y editar ruta"
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setDiskUsageOpen(true)}
        title="Espacio en disco"
      >
        <HardDrive className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={openTerminal}
        title="Abrir terminal aquí"
      >
        <Terminal className="h-4 w-4" />
      </Button>
      <Separator orientation="vertical" className="mx-1 h-full" />

      {editingPath ? (
        <input
          ref={pathInputRef}
          value={pathDraft}
          onChange={(e) => setPathDraft(e.target.value)}
          onBlur={commitPathEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commitPathEdit()
            } else if (e.key === "Escape") {
              e.preventDefault()
              setEditingPath(false)
            }
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="min-w-0 flex-1 rounded border border-border/60 bg-background px-2 py-1 font-mono text-xs outline-none focus:border-primary"
        />
      ) : (
        <Breadcrumb
          className="min-w-0 flex-1 cursor-text overflow-hidden"
          onClick={startPathEdit}
          title="Editar ruta"
        >
          <BreadcrumbList className="flex-nowrap">
            {(segments.length > 6
              ? [segments[0], null, ...segments.slice(-4)]
              : segments
            ).map((seg, i, arr) => {
              if (seg === null) {
                return (
                  <div
                    key="ellipsis"
                    className="flex shrink-0 items-center gap-1.5"
                  >
                    <BreadcrumbItem>
                      <span className="px-1 text-sm text-muted-foreground">
                        …
                      </span>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                  </div>
                )
              }
              const isLast = i === arr.length - 1
              return (
                <div
                  key={seg.path}
                  className={`flex items-center gap-1.5 ${isLast ? "min-w-0 overflow-hidden" : "shrink-0"}`}
                >
                  <BreadcrumbItem
                    className={isLast ? "min-w-0 overflow-hidden" : ""}
                  >
                    {isLast ? (
                      <BreadcrumbPage className="block truncate font-medium">
                        {seg.label}
                      </BreadcrumbPage>
                    ) : (
                      <DroppableBreadcrumbLink
                        seg={seg}
                        isDragging={isDragging}
                        onNavigate={onNavigate}
                      />
                    )}
                  </BreadcrumbItem>
                  {!isLast && <BreadcrumbSeparator />}
                </div>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setShowHidden(!showHidden)}
        title={showHidden ? "Ocultar archivos ocultos" : "Mostrar archivos ocultos"}
      >
        {showHidden ? (
          <Eye className="h-4 w-4" />
        ) : (
          <EyeOff className="h-4 w-4" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setViewMode(viewMode === "list" ? "grid" : "list")}
        title={viewMode === "list" ? "Vista cuadrícula" : "Vista lista"}
      >
        {viewMode === "list" ? (
          <LayoutGrid className="h-4 w-4" />
        ) : (
          <List className="h-4 w-4" />
        )}
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onOpenSettings}
        title="Configuración"
      >
        <Settings className="h-4 w-4" />
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="ml-2 h-9 gap-2 px-6 text-muted-foreground"
        onClick={onOpenSearch}
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden md:inline">Buscar archivos</span>
        <kbd className="ml-1 hidden rounded border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-[10px] sm:inline">
          ⌘K
        </kbd>
      </Button>
    </header>
    {diskUsageOpen && <DiskUsagePanel onClose={() => setDiskUsageOpen(false)} />}
    </>
  )
}
