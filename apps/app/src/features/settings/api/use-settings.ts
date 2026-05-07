import { useCallback, useEffect, useState } from "react"
import { fsGateway } from "@/features/filesystem/infra/fs.gateway"
import { logger } from "@/shared/lib/logger"
import i18n, {
  type Language,
  readStoredLanguage,
  writeStoredLanguage,
} from "@/shared/i18n/i18n"

export type { Language }

export interface TerminalInfo {
  id: string
  name: string
}

const TERMINAL_KEY = "file-explorer:terminal"

function readTerminal(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(TERMINAL_KEY)
}

export function useSettings() {
  const [terminalId, setTerminalIdState] = useState<string | null>(readTerminal)
  const [terminals, setTerminals] = useState<TerminalInfo[]>([])
  const [loadingTerminals, setLoadingTerminals] = useState(false)
  const [language, setLanguageState] = useState<Language | null>(readStoredLanguage)

  const refreshTerminals = useCallback(async () => {
    setLoadingTerminals(true)
    try {
      const list = await fsGateway.listTerminals()
      setTerminals(list)
    } catch (err) {
      logger.error("listTerminals failed", err)
    } finally {
      setLoadingTerminals(false)
    }
  }, [])

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    refreshTerminals()
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [refreshTerminals])

  const setTerminalId = useCallback((id: string | null) => {
    setTerminalIdState(id)
    if (typeof window === "undefined") return
    if (id) window.localStorage.setItem(TERMINAL_KEY, id)
    else window.localStorage.removeItem(TERMINAL_KEY)
  }, [])

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    writeStoredLanguage(lang)
    i18n.changeLanguage(lang)
  }, [])

  return {
    terminalId,
    setTerminalId,
    terminals,
    loadingTerminals,
    refreshTerminals,
    language,
    setLanguage,
  }
}
