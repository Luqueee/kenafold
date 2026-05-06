import { useEffect } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { useHistory } from "@/features/navigation/api/use-history"
import type { useClipboard } from "@/features/filesystem/api/use-clipboard"
import { Toolbar } from "./toolbar"
import { FilterBar } from "./filter-bar"
import { FileTable } from "./file-table"
import { DeleteBar } from "./delete-bar"
import { ErrorBar } from "./error-bar"
import { StatusFooter } from "./status-footer"
import { FileContextMenu } from "./context-menu"
import { QuickLookHost } from "./quick-look-host"
import { FileExplorerProvider } from "../state/explorer-context"

export interface PaneNavApi {
  navigate: (p: string) => void
  back: () => void
  forward: () => void
  current: string | null
}

interface Props {
  paneId: string
  initialPath: string
  isActive: boolean
  showActiveRing: boolean
  onActivate: () => void
  onClose: (() => void) | null
  isFavoriteFn: (p: string) => boolean
  onAddFavorite: (p: string) => void
  onOpenSearch: () => void
  onOpenSettings: () => void
  terminalId: string | null
  registerNav: (id: string, api: PaneNavApi | null) => void
  onPathChange: (id: string, path: string) => void
  clipboardApi: ReturnType<typeof useClipboard>
  headerContainer: HTMLElement | null
  filterContainer: HTMLElement | null
  tagFilter: string | null
}

export function Pane({
  paneId,
  initialPath,
  isActive,
  showActiveRing,
  onActivate,
  onClose,
  isFavoriteFn,
  onAddFavorite,
  onOpenSearch,
  onOpenSettings,
  terminalId,
  registerNav,
  onPathChange,
  clipboardApi,
  headerContainer,
  filterContainer,
  tagFilter,
}: Props) {
  const { current, navigate, back, forward, canBack, canForward } = useHistory(initialPath)

  useEffect(() => {
    registerNav(paneId, { current, navigate, back, forward })
    return () => registerNav(paneId, null)
  }, [paneId, current, navigate, back, forward, registerNav])

  useEffect(() => {
    if (current) onPathChange(paneId, current)
  }, [paneId, current, onPathChange])

  if (!current) return null

  return (
    <FileExplorerProvider
      path={current}
      onNavigate={navigate}
      onBack={back}
      onForward={forward}
      canBack={canBack}
      canForward={canForward}
      onOpenSearch={onOpenSearch}
      onAddFavorite={onAddFavorite}
      isFavorite={isFavoriteFn(current)}
      terminalId={terminalId}
      onOpenSettings={onOpenSettings}
      active={isActive}
      clipboardApi={clipboardApi}
      tagFilter={tagFilter}
    >
      {headerContainer && isActive && createPortal(
        <div className="min-w-0 flex-1 overflow-hidden"><Toolbar /></div>,
        headerContainer
      )}
      {filterContainer && isActive && createPortal(
        <div className="min-w-0 flex-1 overflow-hidden"><FilterBar /></div>,
        filterContainer
      )}
      <div
        onMouseDownCapture={onActivate}
        className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-border/40 first:border-l-0 ${
          showActiveRing ? "ring-1 ring-inset ring-primary/40" : ""
        }`}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-2 right-2 z-10 rounded p-1 text-muted-foreground hover:bg-muted"
            title="Cerrar panel"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <div className="flex min-h-0 flex-1">
          <FileTable />
        </div>
        <DeleteBar />
        <ErrorBar />
        <StatusFooter />
      </div>
      <FileContextMenu />
      <QuickLookHost />
    </FileExplorerProvider>
  )
}
