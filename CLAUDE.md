# Kenafold — File Explorer

Tauri 2 desktop file manager for macOS. Product name: **Kenafold** (`com.luqueee.Kenafold`).

## Stack

| Layer           | Tech                                                       |
| --------------- | ---------------------------------------------------------- |
| Frontend        | React 19, TypeScript, Vite 7, TailwindCSS 4                |
| UI components   | shadcn/ui (radix-ui), lucide-react, iconify (vscode-icons) |
| Tables/virtual  | @tanstack/react-table + @tanstack/react-virtual            |
| Hotkeys         | @tanstack/react-hotkeys                                    |
| Drag & drop     | @dnd-kit                                                   |
| Backend         | Rust (Tauri 2 commands)                                    |
| Package manager | **bun**                                                    |
| Tests           | Vitest + @testing-library/react                            |

## Commands

```bash
bun run tauri dev      # full Tauri app (Rust + frontend)
bun run dev            # frontend only (port 1420)
bun run typecheck      # tsc --noEmit
bun run lint           # eslint
bun run test           # vitest run
bun run test:watch     # vitest watch
```

Never run `bun run build` — see global rules.

## Architecture

Feature-based (Screaming Architecture). Each feature owns its layers:

```
src/features/[feature]/
  api/          # React hooks = use-cases (call infra, expose state)
  domain/       # Pure TS: types, logic, no framework deps
  infra/        # Tauri invoke adapters (gateway pattern)
  components/   # UI components
  hooks/        # Feature-specific hooks (not use-cases)
```

### Features

| Feature         | Responsibility                                                       |
| --------------- | -------------------------------------------------------------------- |
| `file-explorer` | Main pane, selection, view modes (list/grid), inline edit, drag-drop |
| `filesystem`    | File ops (copy, move, delete, rename), undo stack, directory listing |
| `hotkeys`       | Global hotkey registry + user-configurable bindings                  |
| `navigation`    | History (back/forward), favorites                                    |
| `search`        | Full-text search palette (calls Rust grep)                           |
| `settings`      | User preferences panel                                               |
| `sidebar`       | App sidebar with favorites + SMB shares                              |
| `smb`           | SMB/network share mounting                                           |

### Shared

- `src/shared/lib/` — cross-feature pure utilities
- `src/shared/tauri/` — shared Tauri helpers
- `src/components/ui/` — shadcn primitives (do not modify directly)

### State

State lives in `explorer-context.tsx` (React Context + hooks). No global state lib. Context is the single source of truth for the active pane.

### Tauri commands (Rust → `src-tauri/src/`)

`fs.rs`, `archive.rs`, `grep.rs`, `preview.rs`, `search.rs`, `smb.rs`, `terminal.rs`, `watcher.rs`

All called via `fsGateway` in `src/features/filesystem/infra/fs.gateway.ts`.

## Conventions

- Path alias `@/` → `src/`
- Hooks that call Tauri live in `api/` or `infra/`, not inside components
- Domain files have zero React imports — pure TS only
- Tests live next to the file they test (`*.test.ts`)
- UI primitives come from shadcn — don't reinvent them
- TailwindCSS 4 (no `tailwind.config` — configured via CSS)
