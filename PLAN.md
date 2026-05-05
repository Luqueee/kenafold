# Plan: Arreglo de bugs reales de Arbor

## Contexto

Arbor es un explorador de archivos Tauri 2 + React 19 + Rust. El proyecto ya tiene un `TASKS.md` con auditoría previa, pero al revisar el código actual (post-commits recientes de paginación, drag-drop, rename batch, quick look, compresión) se identificaron **bugs concretos** — no mejoras. Este plan se enfoca exclusivamente en bugs verificados leyendo el código fuente, no en refactors o features.

`bun typecheck` pasa limpio y `cargo check` compila. Los problemas son: dos vulnerabilidades de shell injection en Windows, varios bugs de correctness en frontend (race condition de paginación, drag-drop con multiselección, selección perdida tras rename), un escape de symlink en copy recursivo, bugs en la feature nueva de compresión, y antipatterns React detectados por lint.

---

## Bugs a arreglar

### 🔴 P0 — Seguridad (shell injection en Windows)

**1. Inyección en PowerShell** — [src-tauri/src/terminal.rs:201-205](src-tauri/src/terminal.rs#L201-L205)

```rust
.args(["-NoExit", "-Command", &format!("Set-Location '{}'", path)])
```

Un `path` con `'; <cmd>; '` rompe el quote y ejecuta código arbitrario. `path` viene del frontend sin sanitizar.

**Fix:** Pasar el path como argumento separado e invocar `pwsh` con `-WorkingDirectory`:

```rust
Command::new("pwsh")
    .args(["-NoExit", "-WorkingDirectory", &path])
    .spawn()
```

**2. Inyección en CMD** — [src-tauri/src/terminal.rs:206-210](src-tauri/src/terminal.rs#L206-L210)

```rust
.args(["/C", "start", "cmd", "/K", &format!("cd /d {}", path)])
```

Sin comillas: caracteres `&`, `|`, `&&` ejecutan comandos extra.

**Fix:** Usar `current_dir(&path)` en lugar de interpolar:

```rust
Command::new("cmd")
    .args(["/C", "start", "cmd", "/K"])
    .current_dir(&path)
    .spawn()
```

También validar que `path` exista y sea directorio antes de spawnear.

---

### 🟡 P1 — Correctness frontend

**3. Race condition de paginación al cambiar de directorio** — [src/features/filesystem/api/use-directory.ts:18-45](src/features/filesystem/api/use-directory.ts#L18-L45)

Si hay un `loadMore` en vuelo y el usuario navega a otro directorio (o cambia sort), la respuesta vieja se appendea con `setEntries((prev) => [...prev, ...page.entries])` mezclando entradas de dos directorios. Además `offset` queda con el valor del directorio anterior, lo que puede provocar saltos en la siguiente paginación.

**Fix:** Usar un `requestId` (ref incrementable) por `load()`. Al inicio del callback se captura el id; antes de cualquier `setState` se compara contra el ref actual y se descarta si quedó stale. Resetear `offset` a 0 explícitamente al inicio cuando `off === 0`.

**4. Drag de archivo en selección múltiple solo mueve uno** — [src/features/file-explorer/hooks/use-drag-drop.ts:50-78](src/features/file-explorer/hooks/use-drag-drop.ts#L50-L78)

`handleDragEnd` solo opera con `active.data.current?.entry` (el archivo arrastrado), nunca consulta `selectedPaths`. Si hay 5 seleccionados y se arrastra uno, los otros 4 se quedan.

**Fix:** Pasar `selectedPaths` al hook (o leer de un ref) y, si el `src.path` está dentro del set, iterar todas las paths llamando `ops.move`/`ops.copy` por cada una. Cuidado con conflictos de nombre y con no soltar dentro de uno mismo.

**5. Selección perdida tras rename** — [src/features/file-explorer/hooks/use-inline-editing.ts:46-67](src/features/file-explorer/hooks/use-inline-editing.ts#L46-L67) + [src/features/file-explorer/state/explorer-context.tsx:194-204](src/features/file-explorer/state/explorer-context.tsx#L194-L204)

`commitInline` setea `pendingSelect` en `newFolder`/`newFile` pero **no en `rename`**. El effect intenta restaurar selección con `entries.find((e) => e.name === inline.pendingSelect)`, pero al renombrar nunca hay pendingSelect.

**Fix:** En el branch `rename` de `commitInline`, hacer `setPendingSelect(trimmed)` antes de `await ops.rename(...)`.

**6. Effect con dependencia de objeto inestable** — [src/features/file-explorer/state/explorer-context.tsx:204](src/features/file-explorer/state/explorer-context.tsx#L204)

El effect lleva `inline` (objeto completo retornado por `useInlineEditing`) en sus deps. Las funciones del hook no están memoizadas, por lo que `inline` cambia identidad en cada render → el effect re-ejecuta sin necesidad.

**Fix:** Sacar `inline` de las deps. Mantener solo `inline.pendingSelect` y `inline.clearPendingSelect`. Memoizar `clearPendingSelect` con `useCallback`.

---

### 🟡 P1 — Correctness backend (compresión)

`archive.rs` (commit reciente) es la feature nueva de comprimir. Tiene 4 bugs reales.

**7a. Colisión de filenames pierde datos** — [src-tauri/src/archive.rs:97-108](src-tauri/src/archive.rs#L97-L108)

Cuando se comprimen múltiples sources, cada una se appendea al tar usando solo su `file_name()`:

```rust
let name = src.file_name().and_then(|n| n.to_str()).ok_or("Nombre inválido")?;
tar.append_dir_all(name, src)...
tar.append_path_with_name(src, name)...
```

Si el usuario selecciona `/a/foto.jpg` y `/b/foto.jpg`, el segundo **sobrescribe la entrada del primero en el tar**. Pérdida silenciosa de datos.

**Fix:** Detectar colisiones de `name` antes de empezar. Lo más sano: devolver `Err("Hay archivos con el mismo nombre: ...")` para que el frontend muestre un toast.

**7b. Sufijo `unique_dest` rompe extensión en archivos single** — [src-tauri/src/archive.rs:16-29](src-tauri/src/archive.rs#L16-L29)

`unique_dest` usa `file_name()` (no `file_stem()`) como base, así que para un archivo `foto.txt.zst` el resultado de colisión es `foto.txt.zst (1)` — el `(1)` queda **después** de la extensión.

**Fix:** Separar stem y extensión correctamente: `foto.txt.zst` → `foto.txt (1).zst`, `archive.tar.zst` → `archive (1).tar.zst`.

**7c. Compresión bloquea el thread principal de Tauri** — [src-tauri/src/archive.rs:34-39](src-tauri/src/archive.rs#L34-L39)

`compress_entries` es `pub fn` (sync). Para sources de varios GB, el `invoke` queda bloqueado hasta terminar. No hay feedback de progreso.

**Fix:** Convertir a `async fn` y envolver el trabajo pesado en `tauri::async_runtime::spawn_blocking`. Opcionalmente emitir eventos de progreso (`AppHandle::emit`).

**7d. Archivo de salida corrupto si la compresión falla a mitad** — [src-tauri/src/archive.rs:83-113](src-tauri/src/archive.rs#L83-L113)

Si `tar.append_dir_all` falla a mitad (permisos, disco lleno), el `.tar.zst` ya creado queda en disco como archivo corrupto.

**Fix:** Escribir a un path temporal (`<out_path>.partial`) y al final renombrar a `out_path`. En cualquier `Err`, hacer `std::fs::remove_file(&tmp).ok()` antes de propagar el error.

---

### 🟡 P1 — Correctness backend (filesystem)

**8. `copy_dir_recursive` sigue symlinks fuera del árbol** — [src-tauri/src/fs.rs:140-152](src-tauri/src/fs.rs#L140-L152)

`entry.file_type()?.is_dir()` retorna true si un symlink apunta a un dir externo, así que el recursor copia archivos fuera del scope original.

**Fix:** Usar `entry.file_type().is_symlink()` para distinguir y copiar el symlink como tal sin seguirlo.

**9. Posible leak de credenciales SMB en stderr** — [src-tauri/src/smb.rs:108-109](src-tauri/src/smb.rs#L108-L109)

El stderr de `osascript` se devuelve íntegro al frontend. Si la URL SMB con password aparece en el mensaje de error, se filtra a la UI/logs.

**Fix:** Filtrar el stderr antes de devolverlo: si contiene `smb://`, redactar la porción de credenciales (todo entre `://` y `@`).

---

### 🟢 P2 — Lints React (`react-hooks/set-state-in-effect`)

ESLint reporta 9 sitios donde se llama `setState` dentro de un effect sin justificación, lo cual provoca renders extra y en React 19 + Compiler puede inhibir optimizaciones:

- [src/features/file-explorer/components/quick-look.tsx:22](src/features/file-explorer/components/quick-look.tsx#L22)
- [src/features/file-explorer/hooks/use-inline-editing.ts:20](src/features/file-explorer/hooks/use-inline-editing.ts#L20)
- [src/features/file-explorer/state/explorer-context.tsx:178-181](src/features/file-explorer/state/explorer-context.tsx#L178)
- [src/features/search/components/search-palette.tsx:52,57](src/features/search/components/search-palette.tsx#L52)
- [src/features/settings/api/use-settings.ts:35](src/features/settings/api/use-settings.ts#L35)
- [src/features/smb/api/use-smb.ts:33](src/features/smb/api/use-smb.ts#L33)
- [src/features/smb/components/add-smb-dialog.tsx:42](src/features/smb/components/add-smb-dialog.tsx#L42)
- [src/features/file-explorer/components/toolbar.tsx:136](src/features/file-explorer/components/toolbar.tsx#L136) (separado: `no-empty`)

**Fix por sitio:**

- Para resets controlados por prop (`useInlineEditing`, `explorer-context`): mover el reset al handler que cambia el prop, o usar `<Component key={path} />`.
- Para sincronización con estado externo (settings, smb): convertir a `useSyncExternalStore` o silenciar con justificación si la lectura es asíncrona.
- `toolbar.tsx:136`: rellenar el `catch {}` vacío con un log o comentario.

**Nota:** Algunos pueden ser falsos positivos con racional válido — en esos casos, `eslint-disable-next-line` con comentario explicativo.

---

### 🟢 P2 — Lints menores Rust

- **Unused import** — [src-tauri/src/grep.rs:1](src-tauri/src/grep.rs#L1) `use std::path::Path;` sin uso.
- **`return` innecesario** — [src-tauri/src/terminal.rs:169](src-tauri/src/terminal.rs#L169).
- **APIs `cocoa` deprecated** — [src-tauri/src/lib.rs:97-109](src-tauri/src/lib.rs#L97-L109): 9 warnings sobre `NSColor`/`NSWindow`/`nil`. Migración a `objc2` + `objc2-app-kit`. **No bloquea**.

---

## Archivos críticos a modificar

```text
src-tauri/src/terminal.rs        # Bugs 1, 2, lint return
src-tauri/src/archive.rs         # Bugs 7a-7d
src-tauri/src/fs.rs              # Bug 8
src-tauri/src/smb.rs             # Bug 9
src-tauri/src/grep.rs            # Lint
src/features/filesystem/api/use-directory.ts            # Bug 3
src/features/file-explorer/hooks/use-drag-drop.ts       # Bug 4
src/features/file-explorer/hooks/use-inline-editing.ts  # Bug 5, lint
src/features/file-explorer/state/explorer-context.tsx   # Bug 6, lint
+ los archivos de los 9 lints set-state-in-effect
```

## Funciones existentes a reutilizar

- `ensure_within(parent, child)` en [src-tauri/src/path_safety.rs:33](src-tauri/src/path_safety.rs#L33) — ya canonicaliza y valida contención.
- `validate_filename` en mismo archivo — ya filtra caracteres peligrosos.
- `fsErrorMessage` en [src/features/filesystem/domain/fs-error.ts](src/features/filesystem/domain/fs-error.ts) — estandariza errores Tauri al frontend.

## Orden de ejecución sugerido

1. **P0 seguridad** (bugs 1, 2): chico, autocontenido, alto impacto.
2. **Backend correctness compresión** (bugs 7a-7d): acotado a `archive.rs`.
3. **Backend correctness filesystem** (bugs 8, 9): solo Rust.
4. **Frontend correctness** (bugs 3, 4, 5, 6): mayor superficie, requiere prueba manual.
5. **Lints** (P2): batch al final con un commit `chore: fix react-hooks lints`.

## Verificación

### Automatizada

- [ ] `bun typecheck` sigue limpio
- [ ] `bun lint` pasa sin errores (warnings de TanStack Virtual son aceptables)
- [ ] `cd src-tauri && cargo test` (incluyendo los tests existentes de `path_safety`)
- [ ] `cd src-tauri && cargo clippy -- -D warnings` baja a 0 errores nuevos

### Manual (prueba en `bun tauri dev`)

- **Bugs 1, 2** (Windows, requiere VM/host Windows): crear carpeta llamada `'; calc; '` (PowerShell) o `& calc &` (CMD) y abrir terminal desde ahí. Calc no debe aparecer.
- **Bug 3 (race)**: abrir directorio grande (>5000 archivos), iniciar scroll que dispare `loadMore`, e inmediatamente navegar a otro directorio. La lista del nuevo dir no debe contener entradas viejas.
- **Bug 4 (drag multi)**: seleccionar 3 archivos con Cmd+Click, arrastrar uno a otra carpeta. Los 3 deben moverse.
- **Bug 5 (rename selection)**: seleccionar archivo, F2 para renombrar, confirmar. La selección debe quedar en el archivo recién renombrado.
- **Bug 7a (colisión nombres)**: seleccionar dos archivos con mismo nombre en distintas carpetas y comprimir. Debe rechazar con error claro.
- **Bug 7b (extensión)**: comprimir un archivo dos veces al mismo destino. El segundo debe llamarse `<nombre> (1).zst`, no `<nombre>.zst (1)`.
- **Bug 7d (corrupto)**: simular fallo a mitad (ej. permisos o disco lleno). No debe quedar `.tar.zst` parcial.
- **Bug 8 (symlink copy)**: crear `dirA/link → /etc`, copiar `dirA` a `dirB`. `dirB/link` no debe contener una copia recursiva de `/etc`.
- **Bug 9 (smb stderr)**: provocar fallo de mount con SMB y verificar que la URL devuelta no expone password.
