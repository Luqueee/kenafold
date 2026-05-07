/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Terminal, X, Check } from "lucide-react"
import { fsGateway } from "@/features/filesystem/infra/fs.gateway"

const DISMISSED_KEY = "kenafold:cli-banner-dismissed"

type State = "checking" | "hidden" | "visible" | "installing" | "done" | "error"

export function CliInstallBanner() {
  const { t } = useTranslation()
  const [state, setState] = useState<State>("checking")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) {
      setState("hidden")
      return
    }
    fsGateway.cliIsInstalled().then((installed) => {
      setState(installed ? "hidden" : "visible")
    })
  }, [])

  if (state === "checking" || state === "hidden") return null

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1")
    setState("hidden")
  }

  const install = async () => {
    setState("installing")
    try {
      await fsGateway.installCli()
      setState("done")
      setTimeout(dismiss, 2000)
    } catch (e) {
      setError(String(e))
      setState("error")
    }
  }

  return (
    <div className="flex items-center gap-3 border-b border-border/60 bg-muted/40 px-4 py-2 text-sm">
      <Terminal className="h-4 w-4 shrink-0 text-muted-foreground" />

      {state === "done" ? (
        <span className="flex flex-1 items-center gap-1.5 text-green-600 dark:text-green-400">
          <Check className="h-3.5 w-3.5" />
          {t("cliBanner.installed")}
        </span>
      ) : state === "error" ? (
        <span className="flex-1 text-destructive">{error}</span>
      ) : (
        <>
          <span className="flex-1 text-muted-foreground">
            {t("cliBanner.installPrompt")}
          </span>
          <button
            onClick={install}
            disabled={state === "installing"}
            className="rounded px-2.5 py-1 text-xs font-medium ring-1 ring-border hover:bg-accent disabled:opacity-50"
          >
            {state === "installing" ? t("cliBanner.installing") : t("cliBanner.install")}
          </button>
        </>
      )}

      <button
        onClick={dismiss}
        className="rounded p-1 text-muted-foreground hover:bg-muted"
        aria-label={t("cliBanner.dismiss")}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
