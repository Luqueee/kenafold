import type { Hotkey } from "@tanstack/react-hotkeys"

export interface HotkeyAction {
  id: string
  label: string
  group: string
  defaultHotkey: Hotkey
}

export const HOTKEY_ACTIONS = [
  // Navegación
  { id: "search.toggle", label: "Buscar archivos", group: "Navegación", defaultHotkey: "Mod+K" },
  { id: "nav.back", label: "Atrás", group: "Navegación", defaultHotkey: "Mod+[" },
  { id: "nav.forward", label: "Adelante", group: "Navegación", defaultHotkey: "Mod+]" },
  { id: "nav.up", label: "Subir directorio", group: "Navegación", defaultHotkey: "ArrowLeft" },
  { id: "nav.enter", label: "Entrar carpeta", group: "Navegación", defaultHotkey: "ArrowRight" },
  { id: "nav.activate", label: "Abrir selección", group: "Navegación", defaultHotkey: "Enter" },

  // Selección
  { id: "selection.down", label: "Selección abajo", group: "Selección", defaultHotkey: "ArrowDown" },
  { id: "selection.up", label: "Selección arriba", group: "Selección", defaultHotkey: "ArrowUp" },
  { id: "selection.all", label: "Seleccionar todo", group: "Selección", defaultHotkey: "Mod+A" },

  // Archivos
  { id: "file.copy", label: "Copiar", group: "Archivos", defaultHotkey: "Mod+C" },
  { id: "file.cut", label: "Cortar", group: "Archivos", defaultHotkey: "Mod+X" },
  { id: "file.paste", label: "Pegar", group: "Archivos", defaultHotkey: "Mod+V" },
  { id: "file.rename", label: "Renombrar", group: "Archivos", defaultHotkey: "F2" },
  { id: "file.delete", label: "Eliminar", group: "Archivos", defaultHotkey: "Delete" },
  { id: "file.newFile", label: "Nuevo archivo", group: "Archivos", defaultHotkey: "Mod+N" },
  { id: "file.newFolder", label: "Nueva carpeta", group: "Archivos", defaultHotkey: "Mod+Shift+N" },
  { id: "file.duplicate", label: "Duplicar", group: "Archivos", defaultHotkey: "Mod+D" },
  { id: "file.copyPath", label: "Copiar ruta", group: "Archivos", defaultHotkey: "Mod+Shift+C" },
  { id: "file.reveal", label: "Mostrar en Finder", group: "Archivos", defaultHotkey: "Mod+Shift+R" },
  { id: "file.runInTerminal", label: "Ejecutar en terminal", group: "Archivos", defaultHotkey: "Mod+Shift+E" },

  // Vista
  { id: "view.list", label: "Vista lista", group: "Vista", defaultHotkey: "Mod+1" },
  { id: "view.grid", label: "Vista cuadrícula", group: "Vista", defaultHotkey: "Mod+2" },
  { id: "view.reload", label: "Recargar", group: "Vista", defaultHotkey: "Mod+R" },
  { id: "view.editPath", label: "Editar ruta", group: "Vista", defaultHotkey: "Mod+L" },
  { id: "view.terminal", label: "Abrir terminal", group: "Vista", defaultHotkey: "Mod+Shift+T" },
  { id: "view.settings", label: "Abrir configuración", group: "Vista", defaultHotkey: "Mod+," },
  { id: "view.quickLook", label: "Vista previa rápida", group: "Vista", defaultHotkey: "Space" },
  { id: "view.toggleSplit", label: "Dividir / unir paneles", group: "Vista", defaultHotkey: "Mod+T" },
  { id: "view.nextPane", label: "Siguiente panel", group: "Vista", defaultHotkey: "Mod+`" },

  // Historial
  { id: "history.undo", label: "Deshacer", group: "Historial", defaultHotkey: "Mod+Z" },

  // Filtro
  { id: "filter.focus", label: "Enfocar filtro", group: "Filtro", defaultHotkey: "/" },
] as const satisfies readonly HotkeyAction[]

export type HotkeyActionId = (typeof HOTKEY_ACTIONS)[number]["id"]

export const ACTION_BY_ID = Object.fromEntries(
  HOTKEY_ACTIONS.map((a) => [a.id, a])
) as Record<HotkeyActionId, HotkeyAction>
