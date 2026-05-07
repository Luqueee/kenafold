import { RefreshCw, Terminal, Check, Globe } from "lucide-react"
import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { fsGateway } from "@/features/filesystem/infra/fs.gateway"

import { HotkeysList } from "@/features/hotkeys/components/hotkeys-list"

import { SUPPORTED_LANGUAGES, type Language } from "@/shared/i18n/i18n"
import type { TerminalInfo } from "../api/use-settings"
import { Button, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Tabs, TabsContent, TabsList, TabsTrigger, cn } from "@kenafold/ui"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  terminals: TerminalInfo[]
  loadingTerminals: boolean
  terminalId: string | null
  setTerminalId: (id: string | null) => void
  refreshTerminals: () => void
  language: Language | null
  setLanguage: (lang: Language) => void
}

export function SettingsPanel({
  open,
  onOpenChange,
  terminals,
  loadingTerminals,
  terminalId,
  setTerminalId,
  refreshTerminals,
  language,
  setLanguage,
}: Props) {
  const { t } = useTranslation()
  const effectiveId = terminalId ?? terminals[0]?.id ?? null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[28rem] flex-col gap-4 p-6 sm:max-w-lg">
        <SheetHeader className="p-0">
          <SheetTitle>{t("settings.title")}</SheetTitle>
          <SheetDescription>{t("settings.description")}</SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="terminal" className="flex min-h-0 flex-1 flex-col gap-3">
          <TabsList>
            <TabsTrigger value="terminal">{t("settings.terminalTab")}</TabsTrigger>
            <TabsTrigger value="hotkeys">{t("settings.shortcutsTab")}</TabsTrigger>
            <TabsTrigger value="language">{t("settings.languageTab")}</TabsTrigger>
          </TabsList>

          <TabsContent value="terminal" className="m-0 min-h-0 overflow-auto">
            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-medium">{t("settings.defaultTerminal")}</h3>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={refreshTerminals}
                  disabled={loadingTerminals}
                  title={t("settings.reDetect")}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${loadingTerminals ? "animate-spin" : ""}`}
                  />
                </Button>
              </div>

              {terminals.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {loadingTerminals ? t("settings.detecting") : t("settings.noTerminals")}
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {terminals.map((t_) => {
                    const selected = effectiveId === t_.id
                    return (
                      <li key={t_.id}>
                        <button
                          type="button"
                          onClick={() => setTerminalId(t_.id)}
                          className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${
                            selected
                              ? "border-primary/60 bg-primary/10"
                              : "border-border/40 hover:bg-muted/50"
                          }`}
                        >
                          <span>{t_.name}</span>
                          {selected && (
                            <span className="text-xs text-primary">✓</span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <CliSection />
          </TabsContent>

          <TabsContent value="hotkeys" className="m-0 min-h-0 overflow-auto">
            <HotkeysList />
          </TabsContent>

          <TabsContent value="language" className="m-0 min-h-0 overflow-auto">
            <LanguageSection current={language} onSelect={setLanguage} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

function LanguageSection({
  current,
  onSelect,
}: {
  current: Language | null
  onSelect: (lang: Language) => void
}) {
  const { t } = useTranslation()

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">{t("settings.languageLabel")}</h3>
      </div>
      <ul className="flex flex-col gap-1">
        {SUPPORTED_LANGUAGES.map((lang) => {
          const selected = (current ?? "en") === lang
          return (
            <li key={lang}>
              <button
                type="button"
                onClick={() => onSelect(lang)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors",
                  selected
                    ? "border-primary/60 bg-primary/10"
                    : "border-border/40 hover:bg-muted/50"
                )}
              >
                <span>{t(`languages.${lang}`)}</span>
                {selected && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function CliSection() {
  const { t } = useTranslation()
  const [installed, setInstalled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fsGateway.cliIsInstalled().then(setInstalled)
  }, [])

  const install = async () => {
    setBusy(true)
    setError(null)
    try {
      await fsGateway.installCli()
      setInstalled(true)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-3 border-t border-border/40 pt-4">
      <div className="flex items-center gap-2">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">{t("settings.cliTitle")}</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("settings.cliDescription")}
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={install}
        disabled={busy || installed === true}
      >
        {installed === true ? (
          <>
            <Check className="mr-1.5 h-3.5 w-3.5 text-green-500" />
            {t("settings.cliInstalled")}
          </>
        ) : busy ? (
          t("settings.cliInstalling")
        ) : (
          t("settings.cliInstall")
        )}
      </Button>
    </section>
  )
}
