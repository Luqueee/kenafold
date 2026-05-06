# Kenafold — Task Backlog

Legend: 🔴 bug/debt · 🟣 feature · 🔄 refactor · ⚡ UX · 🧪 testing · 📦 distribution

---

## 🔴 Bugs / Deuda técnica

- [x] **Tests de selección incompletos** — 8 tests nuevos: `add`, `remove`, `replace` con path válido, `selectAll([])`, `range` con anchor fuera de lista, idempotencia.
- [x] **Cancelación robusta de archive ops** — `spawn_blocking` usaba `map_err(...)?` que saltaba `unregister` en JoinError; cambiado a `unwrap_or_else` para garantizar cleanup de `CancelMap` y archivos parciales.
- [x] **Race condition watcher** — `ActiveWatcher` ahora tiene `Arc<AtomicBool>` cancellation flag; se activa antes de dropar el watcher viejo. Además watcher estaba totalmente desconectado del frontend: agregado `useDirWatcher` hook + integrado en `FileExplorerProvider`.
- [x] **Memory leak preview grande** — video: `pause()`+`src=""`+`load()` en unmount; PDF iframe: `src="about:blank"` en unmount; timer de volumen en VideoPlayer: `volTimer` ref cancela el `setTimeout`.

---

## 🟣 Features

- [x] **Tags/Labels de archivos** — color-coded, persistidos en SQLite local. Filtrable desde sidebar.
- [x] **Bulk rename con regex/patrón** — `{n}`, `{ext}`, `{date}` tokens. Preview antes de aplicar.
- [x] **Tree view en sidebar** — expand/collapse de carpetas favoritas sin abrir pane.
- [x] **Comparador de carpetas** — diff dos directorios (size, mtime, hash). Útil para sync manual.
- [x] **Hash/checksum panel** — MD5/SHA256/SHA1 al seleccionar archivo. Copy-to-clipboard.
- [x] **Trash/papelera nativa** — usar crate `trash` en Rust. Restore desde UI.
- [x] **Mass tagging por extensión** — seleccionar todos `.pdf` en árbol y aplicar tag.
- [x] **Preview de código con syntax highlight** — shiki para `.ts/.rs/.py/.md`.
- [x] **Sesiones persistidas** — restaurar paneles abiertos al reabrir app.
- [ ] **Comandos personalizados** — user define shell command en settings, aparece en context menu (ej. "Open in iTerm").
- [x] **Filtros guardados** — query del search palette → bookmark reutilizable.
- [ ] **Comparar imágenes lado-a-lado** — viewer dual.
- [x] **Espacio en disco por carpeta** — tree map o sunburst (estilo Disk Inventory X).
- [ ] **Integración Git** — badge en archivos dentro de repo (modified/staged/untracked).

---

## 🔄 Refactors / Performance

- [x] **Virtualizar grid view** — rows virtualizados con ResizeObserver + `useVirtualizer`.
- [x] **Worker para hash/thumbnails** — `preview_file` async con `spawn_blocking`; nuevo `compute_file_hashes` command (SHA256/SHA1/MD5) offloadeado con `spawn_blocking`.
- [x] **Split de explorer-context** — hotkeys extraídos a `use-explorer-hotkeys.ts`; `explorer-context.tsx` 740→530 líneas.
- [x] **Cache de listados** — Map module-level con stale-while-revalidate; `reload()` bypasea cache (para watcher).
- [x] **Lazy load vscode-icons** — `import()` dinámico en `main.tsx`; JSON de 2MB fuera del critical bundle.

---

## ⚡ UX / Pulido

- [ ] **Multi-tab por pane** — chrome-style tabs dentro de cada pane.
- [x] **Quick filter inline** — type-ahead en pane sin abrir search palette.
- [x] **Drag preview con count** — badge con cantidad al arrastrar N archivos.
- [x] **Atajos visibles en menús** — mostrar binding de hotkey al lado de cada acción de context menu.
- [ ] **Onboarding tour** — primera vez: highlight de features clave.
- [ ] **Notificaciones nativas macOS** — al terminar archive/copy largo en background.

---

## 🧪 Testing

- [ ] **Tests Rust de archive ops** — `archive.rs` sin coverage visible.
- [ ] **E2E con Playwright + Tauri** — flow completo: navegar, copiar, extraer.
- [ ] **Snapshot tests de pane** — list/grid view rendering.

---

## 📦 Distribución

- [ ] **Auto-updater Tauri** — `tauri-plugin-updater`.
- [ ] **Universal binary macOS** — Intel + Apple Silicon en mismo bundle.
- [ ] **Notarización + DMG branded** — pipeline de release.
- [ ] **Homebrew cask** — `brew install --cask kenafold`.

---

## Sugerencias de orden

**Pack UX rápido** (alto retorno percibido):

> Dark mode → Breadcrumb editable → Quick filter inline

**Pack foundation técnica** (escala el resto):

> Split context → Grid virtualization → Cache de listados
