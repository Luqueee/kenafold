import * as React from "react"
import {
  Home,
  Monitor,
  FileText,
  Download,
  HardDrive,
  Star,
  Tag,
  X,
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
import { SmbSection } from "@/features/smb/components/smb-section"
import { useTags } from "@/features/tags/api/tags-context"

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
                <SidebarMenuButton
                  isActive={currentPath === item.path}
                  onClick={() => onNavigate(item.path)}
                >
                  <item.icon />
                  {item.label}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            {favorites.map((favPath) => {
              const label = favPath.split("/").filter(Boolean).at(-1) ?? favPath
              return (
                <SidebarMenuItem key={favPath} className="group/fav">
                  <SidebarMenuButton
                    isActive={currentPath === favPath}
                    onClick={() => onNavigate(favPath)}
                  >
                    <Star className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{label}</span>
                  </SidebarMenuButton>
                  <SidebarMenuAction
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveFavorite(favPath)
                    }}
                    title="Quitar de favoritos"
                    className="hidden group-hover/fav:flex"
                  >
                    <X className="h-3 w-3" />
                  </SidebarMenuAction>
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
