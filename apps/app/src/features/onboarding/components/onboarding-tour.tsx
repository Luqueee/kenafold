import { useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

interface Props {
  onDismiss: () => void
}

export function OnboardingTour({ onDismiss }: Props) {
  const { t } = useTranslation()
  const steps = t("onboarding.steps", { returnObjects: true }) as Array<{
    title: string
    description: string
    hint?: string
    icon?: string
  }>
  const ICONS = ["🗂️", "⌨️", "🔍", "⚡", "🪟"]

  const [step, setStep] = useState(0)
  const current = steps[step]
  const isLast = step === steps.length - 1

  function next() {
    if (isLast) onDismiss()
    else setStep((s) => s + 1)
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("onboarding.welcomeTitle")}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss() }}
    >
      <div className="relative flex w-full max-w-sm flex-col gap-6 rounded-2xl border border-border/80 bg-popover p-8 shadow-2xl">
        <div className="flex items-center justify-center gap-1.5">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
              }`}
              aria-label={t("onboarding.step", { number: i + 1 })}
            />
          ))}
        </div>

        <div className="flex flex-col items-center gap-3 text-center">
          <span className="text-5xl leading-none" role="img" aria-hidden>
            {ICONS[step]}
          </span>
          <h2 className="text-lg font-semibold tracking-tight">{current.title}</h2>
          <p className="text-sm text-muted-foreground">{current.description}</p>
          {current.hint && (
            <kbd className="mt-1 rounded-md border border-border bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground">
              {current.hint}
            </kbd>
          )}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={onDismiss}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t("onboarding.skip")}
          </button>
          <button
            onClick={next}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {isLast ? t("onboarding.start") : t("onboarding.next")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
