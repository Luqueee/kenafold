import { useTranslation } from "react-i18next"
import { Keyboard, RotateCcw } from "lucide-react"

import { useHotkeyBindings } from "../bindings"
import { HOTKEY_ACTIONS, type HotkeyActionId } from "../registry"
import { HotkeyRecorderButton } from "./hotkey-recorder-button"
import { Button } from "@kenafold/ui"

const GROUP_I18N_KEY: Record<string, string> = {
  Navegación: "navigation",
  Selección: "selection",
  Archivos: "files",
  Vista: "view",
  Historial: "history",
  Filtro: "filter",
}

export function HotkeysList() {
  const { t } = useTranslation()
  const { bindings, getHotkey, setHotkey, resetHotkey, resetAll } =
    useHotkeyBindings()

  const groups = HOTKEY_ACTIONS.reduce<Record<string, typeof HOTKEY_ACTIONS>>(
    (acc, a) => {
      const list = (acc[a.group] ?? []) as unknown as typeof HOTKEY_ACTIONS
      acc[a.group] = [...list, a] as unknown as typeof HOTKEY_ACTIONS
      return acc
    },
    {}
  )

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">{t("hotkeys.title")}</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={resetAll}
          disabled={Object.keys(bindings).length === 0}
          title={t("hotkeys.restoreAll")}
        >
          <RotateCcw className="h-3 w-3" />
          {t("hotkeys.restore")}
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        {Object.entries(groups).map(([group, actions]) => {
          const groupKey = GROUP_I18N_KEY[group] ?? group
          return (
            <div key={group} className="flex flex-col gap-1.5">
              <h4 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                {t(`hotkeys.groups.${groupKey}`, group)}
              </h4>
              <ul className="flex flex-col">
                {actions.map((a) => {
                  const hk = getHotkey(a.id as HotkeyActionId)
                  const isCustom = bindings[a.id] !== undefined
                  return (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-3 border-b border-border/30 py-1.5 last:border-0"
                    >
                      <span className="truncate text-xs">
                        {t(`hotkeys.actions.${a.id}`, a.label)}
                      </span>
                      <HotkeyRecorderButton
                        hotkey={hk}
                        isCustom={isCustom}
                        onRecord={(h) => setHotkey(a.id as HotkeyActionId, h)}
                        onReset={() => resetHotkey(a.id as HotkeyActionId)}
                      />
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
