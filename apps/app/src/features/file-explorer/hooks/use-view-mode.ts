import { useState } from "react"

export type ViewMode = "list" | "grid"

const STORAGE_KEY = "file-explorer:view-mode"

function read(): ViewMode {
  if (typeof window === "undefined") return "list"
  return window.localStorage.getItem(STORAGE_KEY) === "grid" ? "grid" : "list"
}

export function useViewMode() {
  const [viewMode, setState] = useState<ViewMode>(read)

  function setViewMode(m: ViewMode) {
    setState(m)
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, m)
  }

  return { viewMode, setViewMode }
}
