import { useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { Globe } from "lucide-react"

import { SUPPORTED_LANGUAGES, type Language } from "@/shared/i18n/i18n"
import { Button, cn } from "@kenafold/ui"

interface Props {
  onSelect: (lang: Language) => void
}

export function LanguagePicker({ onSelect }: Props) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<Language>("en")

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex w-80 flex-col items-center gap-6 rounded-2xl border border-border bg-popover px-8 py-8 shadow-2xl">
        <div className="flex flex-col items-center gap-2 text-center">
          <Globe className="h-8 w-8 text-muted-foreground" />
          <h2 className="text-base font-semibold">{t("languagePicker.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("languagePicker.subtitle")}</p>
        </div>

        <div className="flex w-full flex-col gap-2">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setSelected(lang)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors",
                selected === lang
                  ? "border-primary/60 bg-primary/10 font-medium"
                  : "border-border/40 hover:bg-muted/50"
              )}
            >
              <span>{t(`languages.${lang}`)}</span>
              {selected === lang && <span className="text-primary text-xs">✓</span>}
            </button>
          ))}
        </div>

        <Button className="w-full" onClick={() => onSelect(selected)}>
          {t("languagePicker.continue")}
        </Button>
      </div>
    </div>,
    document.body
  )
}
