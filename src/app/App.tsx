import { useCallback, useEffect, useState, type CSSProperties } from "react"
import { useAction } from "@/features/hotkeys/bindings"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/features/sidebar/components/app-sidebar"
import { Toolbar } from "@/features/file-explorer/components/toolbar"
import { FilterBar } from "@/features/file-explorer/components/filter-bar"
import { ExplorerBody } from "@/features/file-explorer/components/explorer-body"
import { DeleteBar } from "@/features/file-explorer/components/delete-bar"
import { ErrorBar } from "@/features/file-explorer/components/error-bar"
import { StatusFooter } from "@/features/file-explorer/components/status-footer"
import { FileContextMenu } from "@/features/file-explorer/components/context-menu"
import { QuickLookHost } from "@/features/file-explorer/components/quick-look-host"
import { FileExplorerProvider } from "@/features/file-explorer/state/explorer-context"
import { SearchPalette } from "@/features/search/components/search-palette"
import { SettingsPanel } from "@/features/settings/components/settings-panel"
import { Toaster } from "@/components/ui/sonner"
import { useSettings } from "@/features/settings/api/use-settings"
import { useHomeDir } from "@/features/filesystem/api/use-directory"
import { fsGateway } from "@/features/filesystem/infra/fs.gateway"
import { useHistory } from "@/features/navigation/api/use-history"
import { useFavorites } from "@/features/navigation/api/use-favorites"
import { readLastPath, writeLastPath } from "@/features/file-explorer/hooks/use-explorer-prefs"
import { logger } from "@/shared/lib/logger"

const sidebarStyle = {
  "--sidebar-width": "calc(var(--spacing) * 56)",
  "--header-height": "calc(var(--spacing) * 12)",
} as CSSProperties

export default function App() {
  const homeDir = useHomeDir()
  // Restore the last visited directory from previous session, fall back to home.
  const initialPath = homeDir ? readLastPath() ?? homeDir : null
  const { current: currentPath, navigate, back, forward, canBack, canForward } = useHistory(initialPath)
  const { favorites, add, remove, isFavorite } = useFavorites()
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settings = useSettings()

  // Persist the current directory so the next launch lands here.
  useEffect(() => {
    if (currentPath) writeLastPath(currentPath)
  }, [currentPath])

  const handleOpenFile = useCallback((p: string) => {
    fsGateway.open(p).catch((e) => logger.error("open failed", e))
  }, [])

  useAction("search.toggle", () => setSearchOpen((v) => !v), { ignoreInputs: false })
  useAction("nav.back", back, { ignoreInputs: true })
  useAction("nav.forward", forward, { ignoreInputs: true })

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (e.button !== 3 && e.button !== 4) return
      e.preventDefault()
      if (e.button === 3) back()
      else forward()
    }
    window.addEventListener("mousedown", onMouseDown)
    return () => window.removeEventListener("mousedown", onMouseDown)
  }, [back, forward])

  return (
    <>
      {currentPath ? (
        <FileExplorerProvider
          path={currentPath}
          onNavigate={navigate}
          onBack={back}
          onForward={forward}
          canBack={canBack}
          canForward={canForward}
          onOpenSearch={() => setSearchOpen(true)}
          onAddFavorite={add}
          isFavorite={isFavorite(currentPath)}
          terminalId={settings.terminalId}
          onOpenSettings={() => setSettingsOpen(true)}
        >
          <SidebarProvider
            className="flex h-svh w-full flex-col overflow-hidden bg-background"
            style={sidebarStyle}
          >
            <Toolbar />
            <FilterBar />
            <div className="flex min-h-0 w-full flex-1 flex-row">
              <AppSidebar
                variant="inset"
                style={{ top: "6rem", bottom: "1.75rem", height: "auto" }}
                homeDir={homeDir}
                currentPath={currentPath}
                favorites={favorites}
                onNavigate={navigate}
                onRemoveFavorite={remove}
              />
              <SidebarInset className="min-w-0 flex-1 overflow-hidden">
                <ExplorerBody />
              </SidebarInset>
            </div>
            <DeleteBar />
            <ErrorBar />
            <StatusFooter />
          </SidebarProvider>
          <FileContextMenu />
          <QuickLookHost />
        </FileExplorerProvider>
      ) : (
        <div className="flex h-svh items-center justify-center text-sm text-muted-foreground">
          Cargando...
        </div>
      )}

      <SettingsPanel
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        terminals={settings.terminals}
        loadingTerminals={settings.loadingTerminals}
        terminalId={settings.terminalId}
        setTerminalId={settings.setTerminalId}
        refreshTerminals={settings.refreshTerminals}
      />

      <SearchPalette
        root={currentPath ?? homeDir ?? "/"}
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onNavigate={navigate}
        onOpenFile={handleOpenFile}
      />

      <Toaster position="bottom-right" richColors closeButton />
    </>
  )
}
