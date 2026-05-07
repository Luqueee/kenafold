import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { Hotkey } from "@tanstack/react-hotkeys"
import { useHotkey } from "@tanstack/react-hotkeys"
import type { UseHotkeyOptions } from "@tanstack/react-hotkeys"
import {
  ACTION_BY_ID,
  HOTKEY_ACTIONS,
  type HotkeyActionId,
} from "./registry"

const STORAGE_KEY = "file-explorer:hotkey-bindings"

type Bindings = Record<string, Hotkey>

function readBindings(): Bindings {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === "object" && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function writeBindings(b: Bindings) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(b))
}

interface BindingsValue {
  bindings: Bindings
  getHotkey: (id: HotkeyActionId) => Hotkey
  setHotkey: (id: HotkeyActionId, hotkey: Hotkey) => void
  resetHotkey: (id: HotkeyActionId) => void
  resetAll: () => void
}

const Ctx = createContext<BindingsValue | null>(null)

export function HotkeyBindingsProvider({ children }: { children: ReactNode }) {
  const [bindings, setBindings] = useState<Bindings>(readBindings)

  const getHotkey = useCallback(
    (id: HotkeyActionId) =>
      (bindings[id] as Hotkey | undefined) ?? ACTION_BY_ID[id].defaultHotkey,
    [bindings]
  )

  const setHotkey = useCallback((id: HotkeyActionId, hotkey: Hotkey) => {
    setBindings((prev) => {
      const next = { ...prev, [id]: hotkey }
      writeBindings(next)
      return next
    })
  }, [])

  const resetHotkey = useCallback((id: HotkeyActionId) => {
    setBindings((prev) => {
      const next = { ...prev }
      delete next[id]
      writeBindings(next)
      return next
    })
  }, [])

  const resetAll = useCallback(() => {
    setBindings({})
    writeBindings({})
  }, [])

  const value = useMemo<BindingsValue>(
    () => ({ bindings, getHotkey, setHotkey, resetHotkey, resetAll }),
    [bindings, getHotkey, setHotkey, resetHotkey, resetAll]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useHotkeyBindings(): BindingsValue {
  const v = useContext(Ctx)
  if (!v)
    throw new Error("useHotkeyBindings must be used within HotkeyBindingsProvider")
  return v
}

export function useAction(
  id: HotkeyActionId,
  callback: (event: KeyboardEvent) => void,
  options?: UseHotkeyOptions
) {
  const { getHotkey } = useHotkeyBindings()
  useHotkey(getHotkey(id), callback, options)
}

export function listActions() {
  return HOTKEY_ACTIONS
}
