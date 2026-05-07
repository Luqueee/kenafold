import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { Plus, X } from "lucide-react"
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

interface TabEntry {
  id: string
  initialPath: string
}

interface PaneTabProps {
  tabId: string
  initialPath: string
  isActiveTab: boolean
  isPaneActive: boolean
  showActiveRing: boolean
  isFavoriteFn: (p: string) => boolean
  onAddFavorite: (p: string) => void
  onOpenSearch: () => void
  onOpenSettings: () => void
  terminalId: string | null
  clipboardApi: ReturnType<typeof useClipboard>
  headerContainer: HTMLElement | null
  filterContainer: HTMLElement | null
  tagFilter: string | null
  registerTabNav: (tabId: string, api: PaneNavApi | null) => void
  onPathChange: (tabId: string, path: string) => void
}

function PaneTab({
  tabId,
  initialPath,
  isActiveTab,
  isPaneActive,
  isFavoriteFn,
  onAddFavorite,
  onOpenSearch,
  onOpenSettings,
  terminalId,
  clipboardApi,
  headerContainer,
  filterContainer,
  tagFilter,
  registerTabNav,
  onPathChange,
}: PaneTabProps) {
  const { current, navigate, back, forward, canBack, canForward } =
    useHistory(initialPath)

  useEffect(() => {
    registerTabNav(tabId, { current, navigate, back, forward })
    return () => registerTabNav(tabId, null)
  }, [tabId, current, navigate, back, forward, registerTabNav])

  useEffect(() => {
    if (current) onPathChange(tabId, current)
  }, [tabId, current, onPathChange])

  if (!current) return null

  const isVisible = isActiveTab

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
      active={isPaneActive && isActiveTab}
      clipboardApi={clipboardApi}
      tagFilter={tagFilter}
    >
      {headerContainer &&
        isPaneActive &&
        isActiveTab &&
        createPortal(
          <div className="min-w-0 flex-1 overflow-hidden">
            <Toolbar />
          </div>,
          headerContainer
        )}
      {filterContainer &&
        isPaneActive &&
        isActiveTab &&
        createPortal(
          <div className="order-0 min-w-0 flex-1 overflow-hidden">
            <FilterBar />
          </div>,
          filterContainer
        )}
      <div
        className={`flex min-h-0 flex-1 flex-col ${isVisible ? "" : "hidden"}`}
      >
        <div className="flex min-h-0 flex-1">
          <FileTable />
        </div>
        <DeleteBar />
        <ErrorBar />
        <StatusFooter />
      </div>
      {isActiveTab && (
        <>
          <FileContextMenu />
          <QuickLookHost />
        </>
      )}
    </FileExplorerProvider>
  )
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
  const { t } = useTranslation()
  const [tabs, setTabs] = useState<TabEntry[]>(() => [
    { id: `${paneId}-t1`, initialPath },
  ])
  const [activeTabId, setActiveTabId] = useState(`${paneId}-t1`)
  const [tabPaths, setTabPaths] = useState<Record<string, string>>({})
  const tabNavApis = useRef<Map<string, PaneNavApi>>(new Map())

  const registerTabNav = useCallback(
    (tabId: string, api: PaneNavApi | null) => {
      if (api) tabNavApis.current.set(tabId, api)
      else tabNavApis.current.delete(tabId)
      if (tabId === activeTabId) registerNav(paneId, api)
    },
    [paneId, activeTabId, registerNav]
  )

  useEffect(() => {
    const api = tabNavApis.current.get(activeTabId) ?? null
    registerNav(paneId, api)
    return () => registerNav(paneId, null)
  }, [activeTabId, paneId, registerNav])

  const handleTabPathChange = useCallback(
    (tabId: string, path: string) => {
      setTabPaths((prev) =>
        prev[tabId] === path ? prev : { ...prev, [tabId]: path }
      )
      if (tabId === activeTabId) onPathChange(paneId, path)
    },
    [activeTabId, paneId, onPathChange]
  )

  useEffect(() => {
    const path = tabPaths[activeTabId]
    if (path) onPathChange(paneId, path)
  }, [activeTabId, paneId, tabPaths, onPathChange])

  const addTab = useCallback(() => {
    const id = `${paneId}-t${Date.now()}`
    const currentPath =
      tabNavApis.current.get(activeTabId)?.current ?? initialPath
    setTabs((prev) => [...prev, { id, initialPath: currentPath }])
    setActiveTabId(id)
  }, [paneId, activeTabId, initialPath])

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        if (prev.length <= 1) return prev
        const remaining = prev.filter((t) => t.id !== tabId)
        if (tabId === activeTabId) {
          const idx = prev.findIndex((t) => t.id === tabId)
          setActiveTabId(remaining[Math.max(0, idx - 1)].id)
        }
        return remaining
      })
      setTabPaths((prev) => {
        if (!(tabId in prev)) return prev
        const next = { ...prev }
        delete next[tabId]
        return next
      })
    },
    [activeTabId]
  )

  function tabLabel(tab: TabEntry) {
    const path = tabPaths[tab.id]
    if (!path) return "…"
    const seg = path.split("/").filter(Boolean).at(-1)
    return seg ?? "/"
  }

  const tabBar = (
    <div className="scrollbar-none order-1 flex h-9 shrink-0 items-center gap-0 overflow-x-auto border-b border-l border-border/60 bg-muted/10">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            className={`group flex h-full max-w-40 shrink-0 items-center gap-1.5 px-3 text-xs font-medium transition-colors ${
              active
                ? "border-x border-border bg-background text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            <button
              className="min-w-0 flex-1 truncate text-left"
              onClick={() => setActiveTabId(tab.id)}
            >
              {tabLabel(tab)}
            </button>
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
                className="shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-muted-foreground/20"
                aria-label={t("pane.closeTab")}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        )
      })}
      <button
        onClick={addTab}
        className="ml-1 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={t("pane.newTab")}
      >
        <Plus className="h-3 w-3" />
      </button>
      {onClose && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="ml-2 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
          aria-label={t("pane.closePane")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )

  return (
    <>
      {filterContainer && isActive && createPortal(tabBar, filterContainer)}
      <div
        onMouseDownCapture={onActivate}
        className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-border/40 first:border-l-0 ${
          showActiveRing ? "ring-1 ring-primary/40 ring-inset" : ""
        }`}
      >
        {tabs.map((tab) => (
          <PaneTab
            key={tab.id}
            tabId={tab.id}
            initialPath={tab.initialPath}
            isActiveTab={tab.id === activeTabId}
            isPaneActive={isActive}
            showActiveRing={showActiveRing}
            isFavoriteFn={isFavoriteFn}
            onAddFavorite={onAddFavorite}
            onOpenSearch={onOpenSearch}
            onOpenSettings={onOpenSettings}
            terminalId={terminalId}
            clipboardApi={clipboardApi}
            headerContainer={headerContainer}
            filterContainer={filterContainer}
            tagFilter={tagFilter}
            registerTabNav={registerTabNav}
            onPathChange={handleTabPathChange}
          />
        ))}
      </div>
    </>
  )
}
