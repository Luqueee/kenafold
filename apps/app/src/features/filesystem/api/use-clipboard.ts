import { useCallback, useState } from "react"
import type { Clipboard } from "../domain/clipboard"

export function useClipboard() {
  const [clipboard, setClipboard] = useState<Clipboard | null>(null)

  const copy = useCallback(
    (paths: string[]) => paths.length > 0 && setClipboard({ paths, op: "copy" }),
    []
  )
  const cut = useCallback(
    (paths: string[]) => paths.length > 0 && setClipboard({ paths, op: "cut" }),
    []
  )
  const clear = useCallback(() => setClipboard(null), [])

  const hasPath = useCallback(
    (path: string) => clipboard?.paths.includes(path) ?? false,
    [clipboard]
  )

  return { clipboard, copy, cut, clear, hasPath }
}
