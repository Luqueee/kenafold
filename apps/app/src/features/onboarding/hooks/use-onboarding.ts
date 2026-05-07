import { useState } from "react"
import { STORAGE_KEY } from "../domain/steps"

export function useOnboarding() {
  const [open, setOpen] = useState(() => {
    try {
      return !localStorage.getItem(STORAGE_KEY)
    } catch {
      return false
    }
  })

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1")
    } catch {}
    setOpen(false)
  }

  return { open, dismiss }
}
