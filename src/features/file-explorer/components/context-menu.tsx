import { useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  FolderOpen,
  Copy,
  CopyPlus,
  Scissors,
  Clipboard,
  ClipboardCopy,
  ExternalLink,
  FilePlus,
  FolderPlus,
  Pencil,
  Play,
  Tag,
  Trash2,
  Archive,
  PackageOpen,
  ChevronRight,
} from "lucide-react"
import { useFileExplorer } from "../state/explorer-context"
import {
  isShellScript,
  isArchive,
} from "@/features/filesystem/domain/file-entry"
import { TagPickerPortal } from "@/features/tags/components/tag-picker"

interface MenuItemProps {
  icon?: React.ReactNode
  label: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

function MenuItem({
  icon,
  label,
  shortcut,
  danger,
  disabled,
  onClick,
}: MenuItemProps) {
  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm disabled:opacity-40 ${
        danger ? "text-destructive hover:bg-destructive/10" : "hover:bg-accent"
      }`}
    >
      <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <span className="flex-1">{label}</span>
      {shortcut && (
        <kbd className="ml-4 font-mono text-[10px] text-muted-foreground">
          {shortcut}
        </kbd>
      )}
    </button>
  )
}

function MenuDivider() {
  return <div className="my-1 border-t border-border/60" />
}

const COMPRESS_FORMATS = [
  { label: "ZIP", ext: ".zip", fmt: "zip" },
  { label: "TAR + ZSTD", ext: ".tar.zst", fmt: "tar.zst" },
  { label: "TAR + GZip", ext: ".tar.gz", fmt: "tar.gz" },
  { label: "TAR + BZip2", ext: ".tar.bz2", fmt: "tar.bz2" },
  { label: "7-Zip", ext: ".7z", fmt: "7z" },
  { label: "RAR", ext: ".rar", fmt: "rar" },
] as const

const COMPRESS_LEVELS = [
  { label: "Rápido", value: "fast" },
  { label: "Normal", value: "normal" },
  { label: "Máximo", value: "best" },
] as const

function CompressFormatMenu({
  x,
  y,
  onSelect,
  onClose,
}: {
  x: number
  y: number
  onSelect: (fmt: string, level: string) => void
  onClose: () => void
}) {
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        role="menu"
        aria-label="Formato de compresión"
        className="fixed z-50 overflow-hidden rounded-lg border border-border/80 bg-popover shadow-xl"
        style={{ left: x, top: y, minWidth: 280 }}
      >
        {/* Header */}
        <div className="flex items-center border-b border-border/60 px-3 py-1.5">
          <span className="flex-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Formato
          </span>
          {COMPRESS_LEVELS.map(({ label, value }) => (
            <span
              key={value}
              className="w-16 text-center text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
            >
              {label}
            </span>
          ))}
        </div>
        {COMPRESS_FORMATS.map(({ label, ext, fmt }) => (
          <div key={fmt} className="flex items-center hover:bg-accent/50">
            <div className="flex flex-1 items-center gap-2 px-3 py-2">
              <Archive className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-sm">{label}</span>
              <span className="text-[11px] text-muted-foreground">{ext}</span>
            </div>
            {COMPRESS_LEVELS.map(({ value }) => (
              <button
                key={value}
                role="menuitem"
                onClick={() => onSelect(fmt, value)}
                className="flex h-full w-16 items-center justify-center py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label={`${label} ${value}`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    value === "fast"
                      ? "bg-green-500"
                      : value === "normal"
                        ? "bg-yellow-500"
                        : "bg-red-500"
                  }`}
                />
              </button>
            ))}
          </div>
        ))}
        <div className="border-t border-border/60 px-3 py-1.5">
          <p className="text-[10px] text-muted-foreground">
            🟢 Rápido · 🟡 Normal · 🔴 Máximo ratio
          </p>
        </div>
      </div>
    </>,
    document.body
  )
}

export function FileContextMenu() {
  const {
    contextMenu,
    closeContextMenu,
    clipboard,
    handleActivate,
    copy,
    cut,
    handlePaste,
    startRename,
    setDeleteTargets,
    startNewFolder,
    startNewFile,
    selectedPaths,
    entries,
    compress,
    decompress,
    duplicate,
    reveal,
    copyPathToClipboard,
    runInTerminal,
  } = useFileExplorer()

  return contextMenu ? (
    <ContextMenuBody
      contextMenu={contextMenu}
      closeContextMenu={closeContextMenu}
      clipboard={clipboard}
      handleActivate={handleActivate}
      copy={copy}
      cut={cut}
      handlePaste={handlePaste}
      startRename={startRename}
      setDeleteTargets={setDeleteTargets}
      startNewFolder={startNewFolder}
      startNewFile={startNewFile}
      selectedPaths={selectedPaths}
      entries={entries}
      compress={compress}
      decompress={decompress}
      duplicate={duplicate}
      reveal={reveal}
      copyPathToClipboard={copyPathToClipboard}
      runInTerminal={runInTerminal}
    />
  ) : null
}

interface BodyProps {
  contextMenu: NonNullable<ReturnType<typeof useFileExplorer>["contextMenu"]>
  closeContextMenu: () => void
  clipboard: ReturnType<typeof useFileExplorer>["clipboard"]
  handleActivate: ReturnType<typeof useFileExplorer>["handleActivate"]
  copy: ReturnType<typeof useFileExplorer>["copy"]
  cut: ReturnType<typeof useFileExplorer>["cut"]
  handlePaste: ReturnType<typeof useFileExplorer>["handlePaste"]
  startRename: ReturnType<typeof useFileExplorer>["startRename"]
  setDeleteTargets: ReturnType<typeof useFileExplorer>["setDeleteTargets"]
  startNewFolder: ReturnType<typeof useFileExplorer>["startNewFolder"]
  startNewFile: ReturnType<typeof useFileExplorer>["startNewFile"]
  selectedPaths: ReturnType<typeof useFileExplorer>["selectedPaths"]
  entries: ReturnType<typeof useFileExplorer>["entries"]
  compress: ReturnType<typeof useFileExplorer>["compress"]
  decompress: ReturnType<typeof useFileExplorer>["decompress"]
  duplicate: ReturnType<typeof useFileExplorer>["duplicate"]
  reveal: ReturnType<typeof useFileExplorer>["reveal"]
  copyPathToClipboard: ReturnType<typeof useFileExplorer>["copyPathToClipboard"]
  runInTerminal: ReturnType<typeof useFileExplorer>["runInTerminal"]
}

function ContextMenuBody({
  contextMenu,
  closeContextMenu,
  clipboard,
  handleActivate,
  copy,
  cut,
  handlePaste,
  startRename,
  setDeleteTargets,
  startNewFolder,
  startNewFile,
  selectedPaths,
  entries,
  compress,
  decompress,
  duplicate,
  reveal,
  copyPathToClipboard,
  runInTerminal,
}: BodyProps) {
  const entry = contextMenu.entry
  const targetPaths =
    entry && selectedPaths.has(entry.path) && selectedPaths.size > 1
      ? Array.from(selectedPaths)
      : entry
        ? [entry.path]
        : []
  const targetEntries = entries.filter((e) => targetPaths.includes(e.path))

  // Measure the menu after first render and reposition if it overflows the viewport.
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState({ x: contextMenu.x, y: contextMenu.y })
  const [tagPickerPos, setTagPickerPos] = useState<{
    x: number
    y: number
  } | null>(null)
  const [compressMenuPos, setCompressMenuPos] = useState<{
    x: number
    y: number
  } | null>(null)
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 8
    let x = contextMenu.x
    let y = contextMenu.y
    if (x + rect.width > window.innerWidth - margin) {
      x = Math.max(margin, window.innerWidth - rect.width - margin)
    }
    if (y + rect.height > window.innerHeight - margin) {
      y = Math.max(margin, window.innerHeight - rect.height - margin)
    }
    if (x !== pos.x || y !== pos.y) setPos({ x, y })
    // pos intentionally omitted — guarded by the equality check above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextMenu.x, contextMenu.y])

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-50"
        onClick={closeContextMenu}
        onContextMenu={(e) => {
          e.preventDefault()
          closeContextMenu()
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        aria-label="Acciones de archivo"
        className="fixed z-50 min-w-50 overflow-hidden rounded-lg border border-border/80 bg-popover py-1 shadow-xl"
        style={{ left: pos.x, top: pos.y }}
      >
        {entry ? (
          <>
            <MenuItem
              icon={<FolderOpen className="h-3.5 w-3.5" />}
              label="Abrir"
              shortcut="↵"
              onClick={() => {
                handleActivate(entry)
                closeContextMenu()
              }}
            />
            {isShellScript(entry) && (
              <MenuItem
                icon={<Play className="h-3.5 w-3.5" />}
                label="Ejecutar en terminal"
                shortcut="⌘⇧E"
                onClick={() => {
                  runInTerminal(entry.path)
                  closeContextMenu()
                }}
              />
            )}
            <MenuItem
              icon={<ExternalLink className="h-3.5 w-3.5" />}
              label="Mostrar en Finder"
              shortcut="⌘⇧R"
              onClick={() => {
                reveal(entry.path)
                closeContextMenu()
              }}
            />
            <MenuDivider />
            <MenuItem
              icon={<Copy className="h-3.5 w-3.5" />}
              label="Copiar"
              shortcut="⌘C"
              onClick={() => {
                copy(targetPaths)
                closeContextMenu()
              }}
            />
            <MenuItem
              icon={<Scissors className="h-3.5 w-3.5" />}
              label="Cortar"
              shortcut="⌘X"
              onClick={() => {
                cut(targetPaths)
                closeContextMenu()
              }}
            />
            <MenuItem
              icon={<Clipboard className="h-3.5 w-3.5" />}
              label="Pegar"
              shortcut="⌘V"
              disabled={!clipboard}
              onClick={() => {
                handlePaste()
                closeContextMenu()
              }}
            />
            <MenuItem
              icon={<CopyPlus className="h-3.5 w-3.5" />}
              label="Duplicar"
              shortcut="⌘D"
              onClick={() => {
                for (const p of targetPaths) duplicate(p)
                closeContextMenu()
              }}
            />
            <MenuItem
              icon={<ClipboardCopy className="h-3.5 w-3.5" />}
              label="Copiar ruta"
              shortcut="⌘⇧C"
              onClick={() => {
                copyPathToClipboard(entry.path)
                closeContextMenu()
              }}
            />
            <MenuDivider />
            <MenuItem
              icon={<Pencil className="h-3.5 w-3.5" />}
              label="Renombrar"
              shortcut="F2"
              onClick={() => {
                startRename(entry)
                closeContextMenu()
              }}
            />
            <MenuDivider />
            <button
              role="menuitem"
              onClick={(e) => {
                const rect = (
                  e.currentTarget as HTMLButtonElement
                ).getBoundingClientRect()
                const SUBMENU_W = 380
                const SUBMENU_H = 230
                const spaceRight = window.innerWidth - rect.right
                const x =
                  spaceRight >= SUBMENU_W
                    ? rect.right + 5
                    : rect.left - SUBMENU_W
                const y =
                  rect.top + SUBMENU_H > window.innerHeight - 8
                    ? Math.max(8, window.innerHeight - 8 - SUBMENU_H)
                    : rect.top
                setCompressMenuPos(compressMenuPos ? null : { x, y: y - 52 })
              }}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
                <Archive className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1">Comprimir como…</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {entry && isArchive(entry) && (
              <MenuItem
                icon={<PackageOpen className="h-3.5 w-3.5" />}
                label="Descomprimir"
                onClick={() => {
                  decompress(entry.path)
                  closeContextMenu()
                }}
              />
            )}
            <MenuDivider />
            <button
              role="menuitem"
              onClick={(e) => {
                const rect = (
                  e.currentTarget as HTMLButtonElement
                ).getBoundingClientRect()
                const TAG_PICKER_W = 130
                const TAG_PICKER_H = 290
                const spaceRight = window.innerWidth - rect.right
                const x =
                  spaceRight >= TAG_PICKER_W
                    ? rect.right + 5
                    : rect.left - TAG_PICKER_W - 5
                const y =
                  rect.top + TAG_PICKER_H > window.innerHeight - 8
                    ? Math.max(8, window.innerHeight - 8 - TAG_PICKER_H)
                    : rect.top
                setTagPickerPos(tagPickerPos ? null : { x, y: y })
              }}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
                <Tag className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1">Etiquetar</span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <MenuDivider />
            <MenuItem
              icon={<Trash2 className="h-3.5 w-3.5" />}
              label="Eliminar"
              shortcut="⌦"
              danger
              onClick={() => {
                setDeleteTargets(targetEntries)
                closeContextMenu()
              }}
            />
          </>
        ) : (
          <>
            <MenuItem
              icon={<FolderPlus className="h-3.5 w-3.5" />}
              label="Nueva carpeta"
              onClick={() => {
                startNewFolder()
                closeContextMenu()
              }}
            />
            <MenuItem
              icon={<FilePlus className="h-3.5 w-3.5" />}
              label="Nuevo archivo"
              onClick={() => {
                startNewFile()
                closeContextMenu()
              }}
            />
            <MenuDivider />
            <MenuItem
              icon={<Clipboard className="h-3.5 w-3.5" />}
              label="Pegar"
              shortcut="⌘V"
              disabled={!clipboard}
              onClick={() => {
                handlePaste()
                closeContextMenu()
              }}
            />
          </>
        )}
      </div>
      {tagPickerPos && (
        <TagPickerPortal
          paths={targetPaths}
          x={tagPickerPos.x}
          y={tagPickerPos.y}
          onClose={() => setTagPickerPos(null)}
        />
      )}
      {compressMenuPos && (
        <CompressFormatMenu
          x={compressMenuPos.x}
          y={compressMenuPos.y}
          onSelect={(fmt, level) => {
            compress(targetPaths, fmt, level)
            closeContextMenu()
          }}
          onClose={() => setCompressMenuPos(null)}
        />
      )}
    </>,
    document.body
  )
}
