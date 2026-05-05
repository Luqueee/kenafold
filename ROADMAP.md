# Roadmap: completar Arbor

## Contexto

Arbor ya cubre lo esencial de un explorador moderno: navegación, paginación, sort, búsqueda fuzzy + grep, drag-drop con multiselección, SMB, terminal launcher, quick look, comprimir, hotkeys, undo. Lo que sigue son las features que un explorador tipo Finder/Files tiene y que acá faltan. Está priorizado por **valor / esfuerzo** — primero los quick wins que multiplican utilidad sin tocar arquitectura, después las features grandes.

**Convenciones del esfuerzo:** S = ≤2h, M = 0.5-1 día, L = 1-3 días.

---

## P0 — Quick wins (alto valor, S–M)

### 1. Botones back/forward en toolbar — S

El historial ya existe en [`features/navigation/api`](src/features/navigation/api/) (useHistory) pero no está expuesto en la toolbar. Solo hay `Cmd+[` / `Cmd+]`.

**Cambios:**
- Agregar dos `<Button>` con flechas en [toolbar.tsx](src/features/file-explorer/components/toolbar.tsx), conectados a `history.back()` / `history.forward()`.
- Disabled cuando no hay historial.

### 2. Tamaño total de selección en status footer — S

[status-footer.tsx](src/features/file-explorer/components/status-footer.tsx) ya muestra el count. Faltan los bytes.

**Cambios:**
- Sumar `entry.size` de los `selectedPaths` (filtrar a archivos, ignorar dirs).
- Formatear con `formatSize` ya existente en `shared/lib/format`.
- Mostrar solo si hay 2+ items seleccionados.

### 3. Persistir sort + último directorio entre sesiones — S

`useViewMode` ya persiste en localStorage. Faltan `sortBy`, `sortDir`, `path`.

**Cambios:**
- Extender el hook (o crear `useExplorerPrefs`) que guarde `{path, sortBy, sortDir}` en localStorage.
- Restaurar al boot en `App.tsx`.
- Considerar un sort por directorio (key = path) para preservar elecciones por carpeta.

### 4. Toggle mostrar archivos ocultos — S

Hoy se filtran `.DS_Store` y similares en `mac-junk.ts`, pero no hay opción para ver dotfiles.

**Cambios:**
- Toggle "Mostrar ocultos" en toolbar (ícono ojo).
- Filtrar en `visibleEntries` de [explorer-context.tsx](src/features/file-explorer/state/explorer-context.tsx) cuando esté off.
- Persistir el toggle.

### 5. Tamaño + fecha en grid view — S

Grid solo muestra nombre. Finder muestra metadata al hover y debajo del thumbnail.

**Cambios:**
- En [file-grid.tsx](src/features/file-explorer/components/file-grid.tsx), agregar línea con `formatSize(size)` (oculta para dirs) bajo el nombre.

### 6. "Pegar" en context menu sobre archivo — S

Hoy "Pegar" solo aparece al click derecho en vacío.

**Cambios:**
- En [context-menu.tsx](src/features/file-explorer/components/context-menu.tsx) habilitar el item Pegar cuando el target es dir (paste dentro) o cuando hay clipboard listo (paste en current dir).

### 7. "Mostrar en Finder" + "Copiar ruta" en context menu — S

Acciones one-shot, ya están las primitivas (`fsGateway.openTerminal` / clipboard).

**Cambios:**
- Comando Tauri `reveal_in_finder(path)` (macOS: `open -R`, Linux: `xdg-open` parent, Windows: `explorer /select,`).
- Items en context-menu.

### 8. Watch del directorio actual con auto-refresh — M

Hoy hay que apretar `Cmd+R` para ver cambios externos.

**Cambios:**
- Agregar `notify` crate al backend.
- Comando que registra un watcher por path y emite eventos `dir:changed` al frontend.
- Hook `useDirectoryWatch(path)` que llame a `reload()` con debounce 200ms.
- Cuidar: liberar el watcher al cambiar de path.

---

## P1 — Features grandes que cierran el producto (M–L)

### 9. Get Info / Properties dialog — M

Stat completo del archivo: permisos rwx, owner/group, fechas (creado, modificado, accedido), filesystem, tipo, archivo padre.

**Cambios backend:**
- `fs::get_metadata(path)` que devuelva un struct con todos los campos.
- Para directorios, opcionalmente computar tamaño recursivo en background (ver #18).

**Cambios frontend:**
- Dialog con tabs "General", "Permisos", "Más". Hotkey `Cmd+I`.

### 10. Descompresión — M

Hoy se comprime pero no se descomprime. Soportar al menos `.zip`, `.tar.gz/.tar.zst/.tar.bz2`, `.gz`, `.zst`, `.7z` (vía `sevenz-rust`).

**Cambios:**
- `archive::extract(archive_path, dest_dir)` — detección por extensión + magic bytes.
- Usar `spawn_blocking` (igual que compress).
- Acción "Extraer aquí" / "Extraer en…" en context menu cuando el target es archivo y la extensión coincide.
- Manejar colisiones (sobreescribir / desambiguar).

### 11. Open With… — M

Listar apps que pueden abrir el archivo y permitir elegir.

**Cambios backend:**
- macOS: `LSCopyApplicationURLsForURL` (vía `core-foundation` o llamar `mdls -name kMDItemCFBundleIdentifier`).
- Linux: `xdg-mime query default <mime>` + leer .desktop files.
- Windows: registry de extensiones.

**Frontend:** submenu en context menu, Cmd+O para "Open With…".

### 12. Tabs / Pestañas — M

Abrir múltiples directorios en pestañas (como navegador).

**Cambios:**
- Estado de tabs a nivel `App.tsx`: array de `{id, path, history}`.
- Barra de pestañas arriba del file explorer.
- Hotkeys: `Cmd+T` (nueva tab → currently abre terminal — reasignar), `Cmd+W` (cerrar), `Cmd+1..9` (saltar a tab).
- Cmd+Click en sidebar abre en nueva tab.

### 13. Thumbnails en grid view — M

Imágenes (jpg/png/heic/webp/avif) y PDFs como thumbnails 110px.

**Cambios:**
- Comando `preview::thumbnail(path, max_dim)` que genere thumbnail PNG (usar `image` crate + `pdfium-render` para PDFs, o evitar PDFs en v1).
- Cache en disco (`%LOCALAPPDATA%/arbor/thumbs/<hash>.png`).
- Hook `useThumbnail(path)` con loader/placeholder.
- Lazy-load: solo pedir thumbnails de items visibles (ya hay virtualizer).

### 14. Filtros avanzados en búsqueda — M

Hoy el search palette es solo string. Agregar tokens tipo `ext:rs size:>1MB date:>2026-01`.

**Cambios:**
- Parser de query en frontend que separe text + filtros.
- Mandar filtros al backend como struct.
- Backend filtra resultados pre-scoring.
- UI: chips visuales bajo el input.

### 15. Vista en columnas (Miller) — L

Estilo Finder: cada nivel del path se muestra como una columna. Click en folder abre nueva columna a la derecha.

**Cambios:**
- Nueva vista en `useViewMode` ("columns").
- Componente `<ColumnsView/>` que renderiza N `<FileList/>` lado a lado.
- Estado: array de `{path, selected}` por columna.
- Scroll horizontal automático al abrir nuevo nivel.

---

## P2 — Power user / nicho (L)

### 16. Dual-pane mode — L

Two file explorers lado a lado (Total Commander style). Útil para mover entre carpetas.

**Cambios:**
- Toggle en toolbar: `<Resizable>` con dos `<FileExplorerProvider>`.
- Drag entre paneles ya funcionaría con `dnd-kit` global.

### 17. Batch rename con regex — M

Renombrar N archivos con find/replace o template (ej. `IMG_{001}.jpg`).

**Cambios:**
- Dialog con preview de renames. Patron tipo VSCode (\1, \2 capture groups).
- Backend command `rename_many(renames: Vec<(from, to)>)` atómico (rollback si alguno falla).

### 18. Tamaño recursivo de directorios — M

Mostrar size real de carpetas, no `—`.

**Cambios:**
- Comando `fs::dir_size(path)` con `walkdir` paralelo.
- Trigger lazy: solo cuando el item entra en viewport o el user pide Get Info.
- Cache LRU para no recomputar.

### 19. Trash view con restore — M

Listar el trash del sistema, permitir restaurar o vaciar.

**Cambios:**
- macOS: ~/.Trash, ~/.Trash/.<volume>
- Linux: ~/.local/share/Trash/files + info/
- Comando `trash::list()` + `trash::restore(name)` + `trash::empty()`.
- Entrada en sidebar "Papelera".

### 20. Tags/labels Finder-style — L

Asignar colores/etiquetas a archivos, filtrar por tag.

**Cambios:**
- Storage: extended attributes (`xattr`) en macOS para nativo, fallback JSON local.
- UI: color picker en context menu, fila de tags en file-row, sidebar de tags.

### 21. Recientes — S

Lista de últimos N archivos abiertos.

**Cambios:**
- Hook `useRecents` que escuche `ops.open` y guarde lista en localStorage (max 50).
- Item en sidebar "Recientes".

### 22. FTP/SFTP/WebDAV mounts — L

Extender el modelo de SMB para otros protocolos. No-trivial — implica scope de seguridad.

**Sugerencia:** delegar al sistema operativo: macOS tiene built-in SFTP/WebDAV via Finder; reusar `osascript mount volume` con URLs distintas.

### 23. Open in editor — S

Acción rápida para abrir el archivo/carpeta en VS Code, Cursor, Sublime, etc. Reusar la lógica de detección de terminales.

**Cambios:**
- Comando `editor::open(path, editor_id)`.
- Setting "Editor por defecto" análogo a "Terminal por defecto".
- Hotkey configurable.

---

## P3 — Polish

### 24. Pegar como link (symlink) — S

Solo macOS/Linux. Item en context menu cuando hay clipboard.

### 25. Reordenar favoritos por drag — S

`dnd-kit/sortable` ya está en deps. La feature está parcial.

### 26. Iconos custom + grupos en favoritos — S

Permitir setear emoji/icono por favorito, separadores.

### 27. Free space en sidebar / status bar — S

`statvfs` nativo ya disponible vía `sysinfo` crate.

### 28. Empty states ilustrados — S

Hoy son texto plano. Agregar ilustración mínima en directorios vacíos.

### 29. Atajo Cmd+D para duplicar — S

Llamar `copy_entry` con sufijo automático ("foo copy 1.txt").

---

## Orden de ejecución sugerido

**Sprint 1 (1-2 días, todos quick wins):** #1, #2, #3, #4, #5, #6, #7, #29 → multiplican utilidad inmediatamente sin tocar arquitectura.

**Sprint 2 (2-3 días, watch + descompresión + properties):** #8, #9, #10 → cierra las funcionalidades core que un explorador "completo" tiene.

**Sprint 3 (3-5 días, polish visual):** #11 (Open With), #13 (thumbnails), #18 (dir size). Esto da el salto visual hacia paridad con Finder.

**Sprint 4 (1 semana+, features grandes):** #12 (tabs), #15 (columns view) → solo si hay demanda real de power users.

**Backlog:** P2/P3 — implementar a demanda según uso.

## Lo que recomiendo NO hacer (todavía)

- **FTP/SFTP/WebDAV custom** (#22): mucha complejidad de seguridad por poco uso. Delegar al SO.
- **Tags propios** (#20): si no hay sync con Finder/iCloud, es un walled garden. Esperar a que se vea demanda.
- **Dual-pane** (#16): solo si llega a ser pedido. Tabs cubre la mayoría de casos.

## Funciones existentes a reutilizar

- [`formatSize`](src/shared/lib/format.ts) y `formatDate` — para todo lo que muestre tamaños/fechas.
- [`fsGateway`](src/features/filesystem/infra/fs.gateway.ts) — única puerta a IPC, mantener convención.
- [`ensure_within`](src-tauri/src/path_safety.rs) — ya validá rutas en cualquier comando nuevo que reciba paths.
- [`spawn_blocking` pattern](src-tauri/src/archive.rs#L107) — usar para ops largas (descompresión, dir_size, watch).
- `useUndoStack` — extender para cubrir nuevas operaciones (extract, batch rename).
