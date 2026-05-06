import * as React from "react"
import { useState, useCallback } from "react"
import {
  Home,
  Monitor,
  FileText,
  Download,
  HardDrive,
  Star,
  Tag,
  X,
  ChevronRight,
  Folder,
  Loader2,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuAction,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
// SidebarMenuButton/SidebarMenuAction used by tags and SMB sections below
import { SmbSection } from "@/features/smb/components/smb-section"
import { useTags } from "@/features/tags/api/tags-context"
import { fsGateway } from "@/features/filesystem/infra/fs.gateway"
import type { FileEntry } from "@/features/filesystem/domain/file-entry"
import { cn } from "@/lib/utils"

interface TreeNodeProps {
  path: string
  label: string
  icon?: React.ReactNode
  depth: number
  currentPath: string
  onNavigate: (path: string) => void
  onRemove?: () => void
}

function FavoriteTreeNode({
  path,
  label,
  icon,
  depth,
  currentPath,
  onNavigate,
  onRemove,
}: TreeNodeProps) {
  const [open, setOpen] = useState(false)
  const [children, setChildren] = useState<FileEntry[] | null>(null)
  const [loading, setLoading] = useState(false)

  const toggle = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!open && children === null) {
        setLoading(true)
        try {
          const page = await fsGateway.list(path, { sortBy: "name", sortDir: "asc" })
          setChildren(page.entries.filter((e) => e.is_dir))
        } catch {
          setChildren([])
        } finally {
          setLoading(false)
        }
      }
      setOpen((o) => !o)
    },
    [open, children, path]
  )

  const isActive = currentPath === path
  const hasLoadedChildren = children !== null
  const hasChildren = !hasLoadedChildren || children.length > 0

  return (
    <div>
      <div
        className={cn(
          "group/node relative flex h-8 cursor-pointer items-center gap-1 rounded-md text-sm",
          "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isActive && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
        )}
        style={{ paddingLeft: `${8 + depth * 14}px`, paddingRight: "8px" }}
        onClick={() => onNavigate(path)}
      >
        <button
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10"
          onClick={toggle}
          title={open ? "Colapsar" : "Expandir"}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : hasChildren ? (
            <ChevronRight
              className={cn("h-3 w-3 transition-transform duration-150", open && "rotate-90")}
            />
          ) : (
            <span className="h-3 w-3" />
          )}
        </button>
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
          {icon ?? <Star className="h-3.5 w-3.5" />}
        </span>
        <span className="flex-1 truncate">{label}</span>
        {onRemove && (
          <button
            className="hidden h-4 w-4 shrink-0 items-center justify-center rounded hover:text-destructive group-hover/node:flex"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            title="Quitar de favoritos"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {open && children && children.length > 0 && (
        <div>
          {children.map((child) => (
            <FavoriteTreeNode
              key={child.path}
              path={child.path}
              label={child.name}
              icon={<Folder className="h-3.5 w-3.5" />}
              depth={depth + 1}
              currentPath={currentPath}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
      {open && children && children.length === 0 && (
        <div
          className="py-1 text-xs text-muted-foreground"
          style={{ paddingLeft: `${8 + (depth + 1) * 14 + 20}px` }}
        >
          Sin subcarpetas
        </div>
      )}
    </div>
  )
}

interface Props extends React.ComponentProps<typeof Sidebar> {
  homeDir: string | null
  currentPath: string
  favorites: string[]
  onNavigate: (path: string) => void
  onRemoveFavorite: (path: string) => void
  tagFilter: string | null
  onTagFilter: (tagId: string | null) => void
}

export function AppSidebar({
  homeDir,
  currentPath,
  favorites,
  onNavigate,
  onRemoveFavorite,
  tagFilter,
  onTagFilter,
  ...props
}: Props) {
  const { getUsedTags } = useTags()
  const usedTags = getUsedTags()
  const defaultBookmarks = React.useMemo(() => {
    if (!homeDir) return []
    return [
      { label: "Inicio", icon: Home, path: homeDir },
      { label: "Escritorio", icon: Monitor, path: `${homeDir}/Desktop` },
      { label: "Documentos", icon: FileText, path: `${homeDir}/Documents` },
      { label: "Descargas", icon: Download, path: `${homeDir}/Downloads` },
    ]
  }, [homeDir])

  return (
    <Sidebar collapsible="offcanvas" className="p-0" {...props}>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Favoritos</SidebarGroupLabel>
          <SidebarMenu>
            {defaultBookmarks.map((item) => (
              <SidebarMenuItem key={item.path}>
                <FavoriteTreeNode
                  path={item.path}
                  label={item.label}
                  icon={<item.icon className="h-3.5 w-3.5" />}
                  depth={0}
                  currentPath={currentPath}
                  onNavigate={onNavigate}
                />
              </SidebarMenuItem>
            ))}
            {favorites.map((favPath) => {
              const label = favPath.split("/").filter(Boolean).at(-1) ?? favPath
              return (
                <SidebarMenuItem key={favPath}>
                  <FavoriteTreeNode
                    path={favPath}
                    label={label}
                    depth={0}
                    currentPath={currentPath}
                    onNavigate={onNavigate}
                    onRemove={() => onRemoveFavorite(favPath)}
                  />
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>

        <SmbSection currentPath={currentPath} onNavigate={onNavigate} />

        {usedTags.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Etiquetas</SidebarGroupLabel>
            <SidebarMenu>
              {usedTags.map((tag) => (
                <SidebarMenuItem key={tag.id} className="group/tag">
                  <SidebarMenuButton
                    isActive={tagFilter === tag.id}
                    onClick={() => onTagFilter(tag.id)}
                  >
                    <Tag className="h-4 w-4 shrink-0" style={{ color: tag.color }} />
                    <span className="flex-1 truncate">{tag.name}</span>
                  </SidebarMenuButton>
                  {tagFilter === tag.id && (
                    <SidebarMenuAction
                      onClick={(e) => { e.stopPropagation(); onTagFilter(null) }}
                      title="Quitar filtro"
                    >
                      <X className="h-3 w-3" />
                    </SidebarMenuAction>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>Dispositivos</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={currentPath === "/"}
                onClick={() => onNavigate("/")}
              >
                <HardDrive />
                Raíz del sistema
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
