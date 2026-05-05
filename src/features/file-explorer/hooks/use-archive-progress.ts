import { useEffect } from "react"
import { listen } from "@tauri-apps/api/event"
import { toast } from "sonner"

interface ArchiveProgressEvent {
  id: string
  operation: "compress" | "decompress"
  current: number
  total: number // -1 = indeterminate
  label: string
  done: boolean
  output: string | null
}

export function useArchiveProgress() {
  useEffect(() => {
    const toastIds = new Map<string, string | number>()

    const unlistenPromise = listen<ArchiveProgressEvent>(
      "archive://progress",
      ({ payload }) => {
        const { id, operation, current, total, label, done, output } = payload
        const isCompress = operation === "compress"
        const verb = isCompress ? "Comprimiendo" : "Descomprimiendo"
        const pastVerb = isCompress ? "Comprimido" : "Descomprimido"

        if (done) {
          const outName = output
            ? output.split("/").pop() ?? output
            : label
          toast.success(`${pastVerb}: ${outName}`, { id: toastIds.get(id) })
          toastIds.delete(id)
          return
        }

        const description =
          label
            ? total > 0
              ? `${label} (${current}/${total})`
              : label
            : undefined

        if (!toastIds.has(id)) {
          const tid = toast.loading(verb, { description })
          toastIds.set(id, tid as string | number)
        } else {
          toast.loading(verb, { id: toastIds.get(id), description })
        }
      }
    )

    return () => {
      unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])
}
