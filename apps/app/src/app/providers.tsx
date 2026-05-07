import type { ReactNode } from "react"
import { HotkeysProvider } from "@tanstack/react-hotkeys"

import { HotkeyBindingsProvider } from "@/features/hotkeys/bindings"
import { TooltipProvider } from "@kenafold/ui"

interface Props {
  children: ReactNode
}

export function AppProviders({ children }: Props) {
  return (
    <HotkeysProvider>
      <HotkeyBindingsProvider>
        <TooltipProvider>{children}</TooltipProvider>
      </HotkeyBindingsProvider>
    </HotkeysProvider>
  )
}
