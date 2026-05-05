# Plan: panel de preview lateral + "Ejecutar en terminal"

## Contexto

Dos features que cierran el explorador como herramienta de día a día:

1. **Panel de preview lateral** — Hoy el preview es modal (Quick Look con `Space`), bloquea el resto de la UI. Se quiere un panel persistente a la derecha del file-table que vaya mostrando el archivo seleccionado en vivo (estilo Finder con preview pane abierto).
2. **Ejecutar en terminal** — Para scripts shell (`.sh`, `.bash`, `.zsh`, `.fish`, `.command`) tener un acceso directo desde el context menu que abra el terminal y ejecute el script.

Ambas se apoyan en infraestructura ya existente: `preview_file` en el backend cubre image/audio/video/pdf/text/unsupported, y `open_terminal` ya sabe abrir múltiples terminales en macOS/Linux/Windows. Lo nuevo es UI (panel + resizable) y un comando backend que pasa `command` además de `cwd`.

---

## Feature 1 — Panel de preview lateral

### Diseño

Layout actual ([App.tsx:79-102](src/app/App.tsx#L79)):

```
SidebarProvider
└── flex-row
    ├── AppSidebar          (sidebar shadcn, ancho fijo ~224px)
    └── SidebarInset
        └── FileTable       (flex-1, ocupa todo el resto)
```

Layout objetivo:

```
SidebarProvider
└── flex-row
    ├── AppSidebar
    └── SidebarInset
        └── ResizablePanelGroup direction="horizontal"
            ├── ResizablePanel (FileTable)
            ├── ResizableHandle
            └── ResizablePanel (PreviewPane, defaultSize=35, minSize=20, maxSize=60, collapsible)
```

El segundo panel es **collapsible**: cuando está colapsado, no se renderiza `<PreviewPane/>` y todo el ancho queda para el file-table. El toggle se controla desde la toolbar.

### Tareas

**1.1 Agregar componente Resizable de shadcn** — S
```
npx shadcn add resizable
```
Crea `src/components/ui/resizable.tsx` (wrappers de `react-resizable-panels`, ya transitivamente disponible vía shadcn). No tocar manualmente.

**1.2 Extraer `PreviewBody` y el fetch de [quick-look.tsx](src/features/file-explorer/components/quick-look.tsx) a un componente reutilizable** — S

Crear `src/features/file-explorer/components/preview-body.tsx` con la lógica que hoy está embebida en QuickLook: fetch de `fsGateway.preview(path)`, estados `loading/error/preview`, switch sobre `preview.kind`. Acepta props `entry: FileEntry` y opcionalmente `compact: boolean` (para esconder los headers cuando esté en pane vs modal).

QuickLook pasa a importar `PreviewBody` y solo se ocupa del chrome del modal (overlay, X, "Espacio o Esc").

**1.3 Crear `PreviewPane`** — M

`src/features/file-explorer/components/preview-pane.tsx`:
- Lee `selEntry` del context (path actualmente seleccionado).
- Si `!selEntry || selEntry.is_dir`: empty state ("Seleccioná un archivo para previsualizar").
- Si hay entry: `<PreviewBody entry={selEntry} compact />`.
- Header pequeño con nombre del archivo + size formateado + botón "Abrir en grande" (que dispara `openQuickLook(selEntry)`).
- Footer chiquito con metadata: tipo, modificado.

**1.4 Estado del pane en context** — S

En `useExplorerPrefs`:
- `previewPaneOpen: boolean` (default `false`) — persistido en localStorage.
- `previewPaneWidth: number` (default `35`) — porcentaje, persistido.

Exponer en `FileExplorerProvider`:
- `previewPaneOpen`, `togglePreviewPane(open?: boolean)`, `setPreviewPaneWidth(pct: number)`.

**1.5 Refactor de [App.tsx](src/app/App.tsx)** — M

Reemplazar `<SidebarInset><FileTable/></SidebarInset>` por:
```tsx
<SidebarInset>
  <ResizablePanelGroup direction="horizontal">
    <ResizablePanel defaultSize={previewOpen ? 100 - previewWidth : 100}>
      <FileTable/>
    </ResizablePanel>
    {previewOpen && (
      <>
        <ResizableHandle/>
        <ResizablePanel
          defaultSize={previewWidth}
          minSize={20}
          maxSize={60}
          onResize={setPreviewPaneWidth}
        >
          <PreviewPane/>
        </ResizablePanel>
      </>
    )}
  </ResizablePanelGroup>
</SidebarInset>
```

**1.6 Toggle en toolbar + hotkey** — S

- Botón en [toolbar.tsx](src/features/file-explorer/components/toolbar.tsx) con ícono `<PanelRight/>` (lucide) que llama `togglePreviewPane()`. Activo si `previewPaneOpen`.
- Hotkey: registrar `view.togglePreview` con default `Cmd+I` en [registry.ts](src/features/hotkeys/registry.ts) (ojo: si Cmd+I se reserva para Get Info en Sprint 2.2 del roadmap, usar `Cmd+Alt+P`). Conectarlo en explorer-context con `useAction`.

**1.7 Decisión sobre Quick Look + pane** — S (decisión, no código)

Cuando el pane está abierto y el user aprieta `Space`, el modal sigue apareciendo encima — se mantiene como vista "amplia" del mismo archivo. No hay conflicto: el pane es vista persistente lateral, el modal es vista temporal fullscreen.

### Verificación manual

- Abrir/cerrar el pane desde el botón. La barra debe persistir entre sesiones.
- Mover el divisor: el ancho debe persistir.
- Seleccionar un archivo de imagen: thumbnail/preview en el pane.
- Seleccionar un PDF: viewer embebido.
- Seleccionar un archivo de texto: contenido renderizado.
- Seleccionar una carpeta: empty state (no preview).
- Resize del pane fluido, sin re-fetch del preview.

---

## Feature 2 — Ejecutar en terminal

### Diseño

`open_terminal` actual ([terminal.rs:194](src-tauri/src/terminal.rs#L194)) solo abre el emulador en una ruta como cwd. Se necesita una variante que **además** ejecute un comando inicial. Cada terminal lo recibe distinto:

| Terminal | Cómo se le pasa el comando |
|----------|----------------------------|
| macOS Terminal.app | `open -a Terminal <script>` (sí ejecuta el script con permiso x) |
| iTerm | `osascript` con `do script "..."` |
| Warp | `open -a Warp` + clipboard hack, o `warp-cli` si está |
| Ghostty | `ghostty -e <cmd>` |
| Alacritty | `alacritty --working-directory <cwd> -e <cmd>` |
| kitty | `kitty --directory <cwd> <cmd>` |
| WezTerm | `wezterm start --cwd <cwd> -- <cmd>` |
| Hyper / Tabby | sin flag estándar — fallback: copiar al clipboard |
| Linux genérico | `<term> --working-directory <cwd> -e bash <script>` |
| Windows wt | `wt -d <cwd> cmd /K <script>` |
| Windows cmd | `cmd /K <script>` con `current_dir` |

La complejidad es por terminal. Un fallback razonable es: si no se puede pasar comando directo, abrir el terminal en `parent_dir` y copiar `bash <script>` al clipboard; el user pega y enter.

### Tareas

**2.1 Comando backend `run_in_terminal`** — M

En [terminal.rs](src-tauri/src/terminal.rs):
```rust
#[tauri::command]
pub fn run_in_terminal(
    script_path: String,
    terminal_id: Option<String>,
) -> Result<(), String>
```

- Validar `Path::new(&script_path).is_file()` y `reject_traversal`.
- Determinar `cwd = parent_of(script_path)` y `cmd = bash <quoted_script_path>`.
- Para macOS: si `terminal_id == "terminal"`, usar `Command::new("open").args(["-a", "Terminal", &script_path])` — Terminal.app respeta el shebang y ejecuta. Para iTerm: `osascript` con `do script`. Para Warp/Hyper/Tabby: fallback (abrir + clipboard). Para Alacritty/kitty/wezterm/ghostty: usar el flag `-e` correspondiente.
- Para Linux: `Command::new(&id).args(["--working-directory", &cwd, "-e", "bash", &script_path])` con fallbacks por terminal.
- Para Windows: `wt -d <cwd> cmd /K <script>`.
- Si todo falla: copiar `bash <script>` al clipboard y abrir terminal en cwd; devolver `Ok(())` con flag de "abrí terminal pero pegá manual" (mensaje en frontend via toast). Esto requiere una variante `Result<RunOutcome, String>` con `RunOutcome::Direct | RunOutcome::FallbackClipboard`.

Registrar en `tauri::generate_handler!` en [lib.rs:117-145](src-tauri/src/lib.rs#L117).

**2.2 Tipo y método en `fsGateway`** — S

```ts
runInTerminal: (scriptPath: string, terminalId?: string | null) =>
  invoke<RunOutcome>("run_in_terminal", { scriptPath, terminalId: terminalId ?? null })
```

Tipo `RunOutcome = "direct" | "fallback_clipboard"` (serde como string lowercase).

**2.3 Detección de "es script ejecutable"** — S

Helper puro en `src/features/filesystem/domain/file-entry.ts` (o un módulo nuevo `executable.ts`):

```ts
const SHELL_EXTS = new Set(["sh", "bash", "zsh", "fish", "command", "ksh", "csh"])

export function isShellScript(entry: FileEntry): boolean {
  if (entry.is_dir) return false
  return entry.extension !== null && SHELL_EXTS.has(entry.extension.toLowerCase())
}
```

Para v1: solo por extensión. Para v2 (ver "Mejoras futuras"): exponer bit ejecutable desde `FileEntry` y permitir cualquier file con `+x`.

**2.4 Context menu — item "Ejecutar en terminal"** — S

En [context-menu.tsx](src/features/file-explorer/components/context-menu.tsx), después del item "Abrir":
```tsx
{isShellScript(entry) && (
  <MenuItem
    icon={<Terminal className="h-3.5 w-3.5" />}
    label="Ejecutar en terminal"
    shortcut="⌘⇧E"
    onClick={() => {
      runInTerminal(entry.path)
      closeContextMenu()
    }}
  />
)}
```

**2.5 Acción + hotkey + handler en context** — S

- Registrar `file.runInTerminal` con default `Cmd+Shift+E` en [registry.ts](src/features/hotkeys/registry.ts).
- En `explorer-context.tsx`, agregar `runInTerminal(path)` al value usando `fsGateway.runInTerminal` + manejo de `RunOutcome`:
  - Si `direct`: nada extra (el usuario ya ve su terminal).
  - Si `fallback_clipboard`: toast con sonner — "Tu terminal no soporta ejecución directa. Pegá el comando que está en el clipboard."
- `useAction("file.runInTerminal", ...)` con `enabled: !!selEntry && isShellScript(selEntry)`.

**2.6 (Opcional) Detectar shebang para archivos sin extensión** — S

Si querés detección más robusta, exponer un comando backend `is_executable(path) -> bool` que lea los primeros 2 bytes y verifique `#!` o consulte el modo del archivo (`metadata.permissions().mode() & 0o111 != 0` en Unix). En frontend, usar el resultado (con caché por path) en el `enabled` del menú item.

**Recomendación:** **diferir a v2.** Por extensión cubre el 95% de los casos y no requiere más IPC.

### Verificación manual

- Click derecho sobre `script.sh`: aparece "Ejecutar en terminal".
- Click derecho sobre `archivo.txt`: NO aparece.
- Ejecutar con Terminal.app: se abre Terminal y se ve la salida del script.
- Ejecutar con iTerm: ídem.
- Ejecutar con Warp/Hyper/Tabby: se abre el terminal en el dir, toast informa que el comando está en clipboard.
- Ejecutar `script.sh` sin permiso `+x`: el script falla y la salida queda visible (responsabilidad del usuario, no nuestra — hacer `chmod +x` antes).

---

## Archivos críticos a modificar

```
src-tauri/src/terminal.rs       # Feature 2 — run_in_terminal
src-tauri/src/lib.rs            # registrar handler
src/components/ui/resizable.tsx # nuevo (shadcn add)
src/features/file-explorer/components/preview-body.tsx    # nuevo (extraído de quick-look)
src/features/file-explorer/components/preview-pane.tsx    # nuevo
src/features/file-explorer/components/quick-look.tsx      # refactor: usa PreviewBody
src/features/file-explorer/components/toolbar.tsx         # botón toggle pane
src/features/file-explorer/components/context-menu.tsx    # item "Ejecutar en terminal"
src/features/file-explorer/state/explorer-context.tsx     # previewPaneOpen + runInTerminal
src/features/file-explorer/hooks/use-explorer-prefs.ts    # persistencia pane
src/features/filesystem/domain/file-entry.ts              # isShellScript helper
src/features/filesystem/infra/fs.gateway.ts               # runInTerminal method
src/features/hotkeys/registry.ts                          # 2 hotkeys nuevas
src/app/App.tsx                                           # ResizablePanelGroup
```

## Funciones / componentes existentes a reutilizar

- [`fsGateway.preview`](src/features/filesystem/infra/fs.gateway.ts) — backend ya cubre todos los tipos.
- `PreviewBody` interno de [quick-look.tsx:105-152](src/features/file-explorer/components/quick-look.tsx#L105) — extraer a archivo propio y reusar.
- [`open_terminal`](src-tauri/src/terminal.rs) — la lógica de detección/launch de cada terminal sirve de base para `run_in_terminal`.
- `useFileExplorer().selEntry` — ya está disponible para que `PreviewPane` lo consuma.
- `useAction` y patrón de `useExplorerPrefs` — para hotkeys y persistencia.

## Orden de ejecución sugerido

1. **Feature 1.1, 1.2** (S+S, ~1h) — instalar resizable, extraer `PreviewBody`. Sin cambio visible aún.
2. **Feature 1.3, 1.4, 1.5, 1.6** (M, ~2-3h) — pane funcionando con toggle + persistencia.
3. **Feature 2.3, 2.4** (S+S, ~30min) — item del menú visible, sin acción real (deshabilitado o con `console.log`).
4. **Feature 2.1, 2.2, 2.5** (M, ~2h) — backend + integración. Probar al menos Terminal.app y un fallback.
5. **Pulido y verificación manual** — todos los puntos de "Verificación".

Estimación total: **~6-7h** de trabajo concentrado.

## Mejoras futuras (fuera de scope)

- **Bit ejecutable real**: exponer `mode` en `FileEntry` y mostrar "Ejecutar en terminal" para cualquier archivo con `+x`, no solo por extensión. Comando `is_executable` en backend con caché.
- **Preview pane con tabs**: además del preview, mostrar metadata en una pestaña aparte (similar al Get Info del Sprint 2.2 del roadmap).
- **Output capture**: en vez de abrir terminal externo, ejecutar el script con `Command::output()` y mostrar stdout/stderr en un panel embebido. Útil para scripts cortos.
- **Confirmación pre-ejecución**: si el script no fue visto antes (tracker en localStorage), mostrar confirmación con preview de las primeras líneas — hedge contra ejecutar scripts maliciosos por accidente.
