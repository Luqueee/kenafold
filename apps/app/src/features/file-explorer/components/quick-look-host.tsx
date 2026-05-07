import { useFileExplorer } from "../state/explorer-context"
import { QuickLook } from "./quick-look"

export function QuickLookHost() {
  const { quickLookEntry, closeQuickLook } = useFileExplorer()
  return <QuickLook entry={quickLookEntry} onClose={closeQuickLook} />
}
