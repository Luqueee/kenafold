import { useEffect, useState } from "react"

import { isTauri, trackedInvoke } from "@/shared/tauri/invoke"

export type MemoryUsage = {
  rss: number
  total: number
}

export function useMemoryUsage(intervalMs = 10_000) {
  const [usage, setUsage] = useState<MemoryUsage | null>(null)

  useEffect(() => {
    if (!isTauri()) return

    let cancelled = false

    const tick = async () => {
      try {
        const result = await trackedInvoke<MemoryUsage>("get_memory_usage")
        if (!cancelled) setUsage(result)
      } catch {
        // ignore
      }
    }

    tick()
    const id = window.setInterval(tick, intervalMs)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [intervalMs])

  return usage
}
