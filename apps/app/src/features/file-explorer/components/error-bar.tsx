import { AlertCircle } from "lucide-react"
import { useFileExplorer } from "../state/explorer-context"

export function ErrorBar() {
  const { opError, clearOpError } = useFileExplorer()
  if (!opError) return null

  return (
    <div className="flex w-full shrink-0 items-center gap-3 border-t border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{opError}</span>
      <button onClick={clearOpError} className="text-xs hover:opacity-70">
        ✕
      </button>
    </div>
  )
}
