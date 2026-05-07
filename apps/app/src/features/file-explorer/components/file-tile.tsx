import { useDraggable, useDroppable } from "@dnd-kit/core"
import type { FileEntry } from "@/features/filesystem/domain/file-entry"

interface Props {
  entry: FileEntry
  isSelected: boolean
  isCut: boolean
  isRenaming: boolean
  onClick: (e: React.MouseEvent) => void
  onDoubleClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  children: React.ReactNode
}

export function FileTile({
  entry,
  isSelected,
  isCut,
  isRenaming,
  onClick,
  onDoubleClick,
  onContextMenu,
  children,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: entry.path,
    data: { entry },
    disabled: isRenaming,
  })

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${entry.path}`,
    data: { entry },
    disabled: !entry.is_dir,
  })

  return (
    <div
      ref={(el) => {
        setDragRef(el)
        if (entry.is_dir) setDropRef(el)
      }}
      data-path={entry.path}
      className={`group flex cursor-pointer select-none flex-col items-center gap-2 rounded-md border border-transparent p-3 transition-colors ${
        isOver
          ? "bg-primary/15 ring-1 ring-inset ring-primary/50"
          : isSelected
            ? "border-border/60 bg-accent/60"
            : "hover:bg-muted/40"
      } ${isDragging || isCut ? "opacity-40" : ""}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
      role="button"
      aria-pressed={isSelected}
      aria-label={`${entry.is_dir ? "Carpeta" : "Archivo"} ${entry.name}`}
      tabIndex={isSelected ? 0 : -1}
    >
      {children}
    </div>
  )
}
