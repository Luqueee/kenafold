import { useEffect } from "react"
import { listen } from "@tauri-apps/api/event"
import { fsGateway } from "../infra/fs.gateway"
import { logger } from "@/shared/lib/logger"

/**
 * Watches `path` via the Rust watcher and calls `onChanged` when the
 * directory contents change on disk. Only one directory is watched at
 * a time (enforced by the Rust side).
 */
export function useDirWatcher(path: string, onChanged: () => void) {
  useEffect(() => {
    let alive = true

    fsGateway.watchDirectory(path).catch((e) =>
      logger.error("watch_directory failed", e)
    )

    const unlistenPromise = listen<string>("dir:changed", (event) => {
      if (!alive) return
      // Only reload if the event is for the currently watched path.
      if (event.payload === path) onChanged()
    })

    return () => {
      alive = false
      fsGateway.unwatchDirectory().catch((e) =>
        logger.error("unwatch_directory failed", e)
      )
      unlistenPromise.then((unlisten) => unlisten())
    }
  }, [path, onChanged])
}
