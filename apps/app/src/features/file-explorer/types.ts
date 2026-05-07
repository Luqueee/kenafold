import type { FileEntry } from "@/features/filesystem/domain/file-entry"

export interface ContextMenuState {
  x: number
  y: number
  entry: FileEntry | null
}

export interface FileExplorerProps {
  path: string
  onNavigate: (path: string) => void
  onOpenSearch: () => void
  onAddFavorite: (path: string) => void
  isFavorite: boolean
}
