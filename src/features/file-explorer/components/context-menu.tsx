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
} from "lucide-react"
import { useFileExplorer } from "../state/explorer-context"
import { isShellScript, isArchive } from "@/features/filesystem/domain/file-entry"
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
  const [tagPickerPos, setTagPickerPos] = useState<{ x: number; y: number } | null>(null)
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
            <MenuItem
              icon={<Archive className="h-3.5 w-3.5" />}
              label="Comprimir (.tar.zst)"
              onClick={() => {
                compress(targetPaths)
                closeContextMenu()
              }}
            />
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
            <MenuItem
              icon={<Tag className="h-3.5 w-3.5" />}
              label="Etiquetar"
              onClick={() => setTagPickerPos({ x: pos.x + 208, y: pos.y })}
            />
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
          onClose={() => { setTagPickerPos(null); closeContextMenu() }}
        />
      )}
    </>,
    document.body
  )
}
