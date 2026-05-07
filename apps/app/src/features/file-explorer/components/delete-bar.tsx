import { useTranslation } from "react-i18next"
import { useHotkey } from "@tanstack/react-hotkeys"
import { Trash2 } from "lucide-react"
import { useFileExplorer } from "../state/explorer-context"

export function DeleteBar() {
  const { t } = useTranslation()
  const { deleteTargets, setDeleteTargets, confirmDelete } = useFileExplorer()

  useHotkey("Enter", () => { confirmDelete() }, {
    enabled: deleteTargets.length > 0,
    ignoreInputs: false,
  })
  if (deleteTargets.length === 0) return null

  const isSingle = deleteTargets.length === 1
  const label = isSingle ? deleteTargets[0].name : String(deleteTargets.length)

  return (
    <div className="flex w-full shrink-0 items-center gap-3 border-t border-destructive/40 bg-destructive/10 px-4 py-2 text-sm">
      <Trash2 className="h-4 w-4 shrink-0 text-destructive" />
      <span className="flex-1 truncate">
        {t("deleteBar.confirmPrefix")}{" "}
        <strong>{label}</strong>{" "}
        {isSingle ? t("deleteBar.confirmSuffix") : t("deleteBar.confirmManySuffix")}
      </span>
      <button
        onClick={confirmDelete}
        className="text-destructive-foreground rounded bg-destructive px-3 py-1 text-xs font-medium hover:bg-destructive/90"
      >
        {t("deleteBar.moveToTrash")}
      </button>
      <button
        onClick={() => setDeleteTargets([])}
        className="rounded px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
      >
        {t("deleteBar.cancel")}
      </button>
    </div>
  )
}
