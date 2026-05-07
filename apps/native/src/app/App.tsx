import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import { invoke } from "@tauri-apps/api/core"
import { useAction } from "@/features/hotkeys/bindings"

import { AppSidebar } from "@/features/sidebar/components/app-sidebar"
import { Pane, type PaneNavApi } from "@/features/file-explorer/components/pane"
import { SearchPalette } from "@/features/search/components/search-palette"
import { SettingsPanel } from "@/features/settings/components/settings-panel"

import { useSettings } from "@/features/settings/api/use-settings"
import { useHomeDir } from "@/features/filesystem/api/use-directory"
import { fsGateway } from "@/features/filesystem/infra/fs.gateway"
import { useFavorites } from "@/features/navigation/api/use-favorites"
import {
  readLastPath,
  writeLastPath,
  readSession,
  writeSession,
} from "@/features/file-explorer/hooks/use-explorer-prefs"
import { ArchiveProgressPanel } from "@/features/file-explorer/components/archive-progress-panel"
import { TrashPanel } from "@/features/file-explorer/components/trash-panel"
import { useSavedSearches } from "@/features/search/api/use-saved-searches"
import { useClipboard } from "@/features/filesystem/api/use-clipboard"
import { logger } from "@/shared/lib/logger"
import { TagsProvider } from "@/features/tags/api/tags-context"
import { OnboardingTour } from "@/features/onboarding/components/onboarding-tour"
import { CliInstallBanner } from "@/features/file-explorer/components/cli-install-banner"
import { useOnboarding } from "@/features/onboarding/hooks/use-onboarding"
import { LanguagePicker } from "@/features/settings/components/language-picker"
import { useTranslation } from "react-i18next"
import { SidebarInset, SidebarProvider, Toaster } from "@kenafold/ui"

const sidebarStyle = {
  "--sidebar-width": "calc(var(--spacing) * 56)",
  "--header-height": "calc(var(--spacing) * 12)",
} as CSSProperties

interface PaneEntry {
  id: string
  initialPath: string
}

export default function App() {
  const homeDir = useHomeDir()
  const { favorites, add, remove, isFavorite } = useFavorites()
  const [searchOpen, setSearchOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settings = useSettings()
  const clipboardApi = useClipboard()

  const [panes, setPanes] = useState<PaneEntry[]>([])
  const [activeId, setActiveId] = useState<string>("")
  const [pathByPane, setPathByPane] = useState<Record<string, string>>({})

  const navRefs = useRef<Map<string, PaneNavApi>>(new Map())

  useEffect(() => {
    if (homeDir && panes.length === 0) {
      invoke<string | null>("get_cli_path").then((cliPath) => {
        if (cliPath) {
          const id = "p-1"
          setPanes([{ id, initialPath: cliPath }])
          setActiveId(id)
          return
        }
        const session = readSession()
        if (session && session.panes.length > 0) {
          setPanes(session.panes.map((p) => ({ id: p.id, initialPath: p.path })))
          setActiveId(session.activeId)
        } else {
          const id = "p-1"
          setPanes([{ id, initialPath: readLastPath() ?? homeDir }])
          setActiveId(id)
        }
      })
    }
  }, [homeDir, panes.length])

  const activePath = pathByPane[activeId] ?? null

  const registerNav = useCallback((id: string, api: PaneNavApi | null) => {
    if (api) navRefs.current.set(id, api)
    else navRefs.current.delete(id)
  }, [])

  const onPathChange = useCallback((id: string, path: string) => {
    setPathByPane((m) => (m[id] === path ? m : { ...m, [id]: path }))
  }, [])

  const navigateActive = useCallback(
    (p: string) => {
      navRefs.current.get(activeId)?.navigate(p)
    },
    [activeId]
  )

  const backActive = useCallback(() => {
    navRefs.current.get(activeId)?.back()
  }, [activeId])

  const forwardActive = useCallback(() => {
    navRefs.current.get(activeId)?.forward()
  }, [activeId])

  const closePane = useCallback(
    (id: string) => {
      setPanes((ps) => {
        if (ps.length <= 1) return ps
        const remaining = ps.filter((p) => p.id !== id)
        if (id === activeId) setActiveId(remaining[0].id)
        return remaining
      })
      setPathByPane((m) => {
        if (!(id in m)) return m
        const next = { ...m }
        delete next[id]
        return next
      })
    },
    [activeId]
  )

  const toggleSplit = useCallback(() => {
    if (panes.length === 1) {
      const id = `p-${Date.now()}`
      const initial = activePath ?? homeDir ?? "/"
      setPanes([panes[0], { id, initialPath: initial }])
      setActiveId(id)
    } else {
      const inactive = panes.find((p) => p.id !== activeId)
      if (inactive) closePane(inactive.id)
    }
  }, [panes, activeId, activePath, homeDir, closePane])

  const nextPane = useCallback(() => {
    if (panes.length < 2) return
    const idx = panes.findIndex((p) => p.id === activeId)
    setActiveId(panes[(idx + 1) % panes.length].id)
  }, [panes, activeId])

  useEffect(() => {
    if (activePath) writeLastPath(activePath)
  }, [activePath])

  useEffect(() => {
    if (panes.length === 0 || Object.keys(pathByPane).length === 0) return
    writeSession({
      panes: panes.map((p) => ({ id: p.id, path: pathByPane[p.id] ?? p.initialPath })),
      activeId,
    })
  }, [panes, pathByPane, activeId])

  const handleOpenFile = useCallback((p: string) => {
    fsGateway.open(p).catch((e) => logger.error("open failed", e))
  }, [])

  useAction("search.toggle", () => setSearchOpen((v) => !v), {
    ignoreInputs: false,
  })
  useAction("nav.back", backActive, { ignoreInputs: true })
  useAction("nav.forward", forwardActive, { ignoreInputs: true })
  useAction("view.toggleSplit", toggleSplit, { ignoreInputs: true })
  useAction("view.nextPane", nextPane, { ignoreInputs: true })

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (e.button !== 3 && e.button !== 4) return
      e.preventDefault()
      if (e.button === 3) backActive()
      else forwardActive()
    }
    window.addEventListener("mousedown", onMouseDown)
    return () => window.removeEventListener("mousedown", onMouseDown)
  }, [backActive, forwardActive])

  const sidebarFocusPath = activePath ?? homeDir ?? "/"

  const [trashOpen, setTrashOpen] = useState(false)
  const { searches: savedSearches, add: saveSearch, remove: removeSavedSearch, isSaved } = useSavedSearches()
  const [pendingSearch, setPendingSearch] = useState<{ query: string; mode: "name" | "content" } | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  const handleTagFilter = useCallback((tagId: string | null) => {
    setTagFilter((prev) => (prev === tagId ? null : tagId))
  }, [])

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setTagFilter(null)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [activePath])

  const [headerEl, setHeaderEl] = useState<HTMLDivElement | null>(null)
  const [filterEl, setFilterEl] = useState<HTMLDivElement | null>(null)
  const onboarding = useOnboarding()
  const { t } = useTranslation()

  return (
    <TagsProvider>
      {homeDir ? (
        <SidebarProvider
          className="flex h-svh w-full flex-col overflow-hidden bg-background"
          style={sidebarStyle}
        >
          <div ref={setHeaderEl} className="flex w-full shrink-0" />
          <div ref={setFilterEl} className="flex w-full shrink-0" />
          <div className="flex min-h-0 w-full flex-1 flex-row">
            <AppSidebar
              variant="inset"
              style={{ top: "5.25rem", bottom: "1.75rem", height: "auto" }}
              homeDir={homeDir}
              currentPath={sidebarFocusPath}
              favorites={favorites}
              onNavigate={navigateActive}
              onRemoveFavorite={remove}
              tagFilter={tagFilter}
              onTagFilter={handleTagFilter}
              onOpenTrash={() => setTrashOpen(true)}
              savedSearches={savedSearches}
              onOpenSavedSearch={(q, m) => { setPendingSearch({ query: q, mode: m }); setSearchOpen(true) }}
              onRemoveSavedSearch={removeSavedSearch}
            />
            <SidebarInset className="flex min-w-0 flex-1 flex-col overflow-hidden">
              <CliInstallBanner />
              <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
                {panes.map((p) => (
                  <Pane
                    key={p.id}
                    paneId={p.id}
                    initialPath={p.initialPath}
                    isActive={p.id === activeId}
                    showActiveRing={panes.length > 1 && p.id === activeId}
                    onActivate={() => setActiveId(p.id)}
                    onClose={panes.length > 1 ? () => closePane(p.id) : null}
                    isFavoriteFn={isFavorite}
                    onAddFavorite={add}
                    onOpenSearch={() => setSearchOpen(true)}
                    onOpenSettings={() => setSettingsOpen(true)}
                    terminalId={settings.terminalId}
                    registerNav={registerNav}
                    onPathChange={onPathChange}
                    clipboardApi={clipboardApi}
                    headerContainer={headerEl}
                    filterContainer={filterEl}
                    tagFilter={p.id === activeId ? tagFilter : null}
                  />
                ))}
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
      ) : (
        <div className="flex h-svh items-center justify-center text-sm text-muted-foreground">
          {t("common.loading")}
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
        language={settings.language}
        setLanguage={settings.setLanguage}
      />

      {trashOpen && (
        <TrashPanel
          onClose={() => setTrashOpen(false)}
          restorePath={sidebarFocusPath}
        />
      )}

      <SearchPalette
        root={sidebarFocusPath}
        open={searchOpen}
        onClose={() => { setSearchOpen(false); setPendingSearch(null) }}
        onNavigate={navigateActive}
        onOpenFile={handleOpenFile}
        initialQuery={pendingSearch?.query}
        initialMode={pendingSearch?.mode}
        onSave={saveSearch}
        onUnsave={(q, m) => {
          const found = savedSearches.find((s) => s.query === q.trim() && s.mode === m)
          if (found) removeSavedSearch(found.id)
        }}
        isSaved={isSaved}
      />

      {onboarding.open && <OnboardingTour onDismiss={onboarding.dismiss} />}
      {settings.language === null && (
        <LanguagePicker onSelect={settings.setLanguage} />
      )}
      <ArchiveProgressPanel />
      <Toaster position="bottom-right" richColors closeButton />
    </TagsProvider>
  )
}
