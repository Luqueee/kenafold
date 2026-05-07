/* eslint-disable react-hooks/rules-of-hooks */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { test as base, expect, type Page } from "@playwright/test"

// ─── Mock data ──────────────────────────────────────────────────────────────

export const HOME = "/home/test"

export const HOME_ENTRIES = [
  {
    name: "Documents",
    path: `${HOME}/Documents`,
    is_dir: true,
    size: 0,
    modified: 1_700_000_000_000,
    extension: null,
  },
  {
    name: "archivo.zip",
    path: `${HOME}/archivo.zip`,
    is_dir: false,
    size: 4096,
    modified: 1_700_000_000_000,
    extension: "zip",
  },
  {
    name: "notes.txt",
    path: `${HOME}/notes.txt`,
    is_dir: false,
    size: 512,
    modified: 1_700_000_000_000,
    extension: "txt",
  },
]

export const DOCUMENTS_ENTRIES = [
  {
    name: "proyecto",
    path: `${HOME}/Documents/proyecto`,
    is_dir: true,
    size: 0,
    modified: 1_700_000_000_000,
    extension: null,
  },
  {
    name: "readme.md",
    path: `${HOME}/Documents/readme.md`,
    is_dir: false,
    size: 256,
    modified: 1_700_000_000_000,
    extension: "md",
  },
]

// ─── IPC mock injected into browser context before app scripts run ───────────

async function injectTauriMock(
  page: Page,
  data: {
    home: string
    homeEntries: typeof HOME_ENTRIES
    docsEntries: typeof DOCUMENTS_ENTRIES
  }
) {
  await page.addInitScript((d) => {
    // Track all IPC calls so tests can assert on them.
    const calls: Array<{ cmd: string; args: unknown }> = []
    ;(window as any).__e2e_calls = calls

    // Minimal callback registry — needed by @tauri-apps/api event system.
    let _cbId = 0
    ;(window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args: Record<string, unknown>) => {
        switch (cmd) {
          case "get_home_dir":
            return d.home

          case "list_directory": {
            const p = (args as any)?.path as string
            const entries =
              p === d.home
                ? d.homeEntries
                : p === `${d.home}/Documents`
                  ? d.docsEntries
                  : []
            return { entries, total: entries.length, offset: 0, limit: 2_000 }
          }

          case "copy_entry":
          case "move_entry":
          case "delete_entry":
          case "delete_entries":
          case "decompress_entry":
            calls.push({ cmd, args })
            return cmd === "decompress_entry" ? d.home : undefined

          case "watch_directory":
          case "unwatch_directory":
          case "create_dir":
          case "create_file":
          case "open_file":
            return undefined

          case "list_terminals":
            return []

          case "smb_list":
            return []

          case "list_trash":
            return []

          default:
            // Silence plugin calls (log, opener, …) and unknown commands.
            if (cmd.startsWith("plugin:")) return null
            console.warn("[E2E] Unhandled Tauri command:", cmd, args)
            return null
        }
      },

      transformCallback: (
        callback: (...a: unknown[]) => void,
        once?: boolean
      ) => {
        _cbId++
        const key = `_${_cbId}`
        ;(window as any)[key] = once
          ? (...a: unknown[]) => {
              callback(...a)
              delete (window as any)[key]
            }
          : callback
        return _cbId
      },

      metadata: {
        windows: [{ label: "main" }],
        currentWindow: { label: "main" },
      },
    }
  }, data)
}

// ─── Custom fixture ──────────────────────────────────────────────────────────

type Fixtures = {
  /** Page with Tauri IPC mocked and app loaded. */
  mockedPage: Page
  /** Retrieve IPC calls recorded during the test. */
  getIpcCalls: () => Promise<Array<{ cmd: string; args: unknown }>>
}

export const test = base.extend<Fixtures>({
  mockedPage: async ({ page }, use) => {
    // Skip onboarding tour so it doesn't block pointer events.
    await page.addInitScript(() => {
      localStorage.setItem("kenafold:onboarding-done", "1")
    })

    await injectTauriMock(page, {
      home: HOME,
      homeEntries: HOME_ENTRIES,
      docsEntries: DOCUMENTS_ENTRIES,
    })

    await page.goto("/")

    // Wait for the app shell to finish initializing (file rows appear).
    await page.waitForSelector(`tr[data-path]`, { timeout: 15_000 })

    await use(page)
  },

  getIpcCalls: async ({ page }, use) => {
    await use(() =>
      page.evaluate(
        () =>
          (window as any).__e2e_calls as Array<{ cmd: string; args: unknown }>
      )
    )
  },
})

export { expect }
