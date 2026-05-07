import { error as logError, warn as logWarn, info as logInfo, debug as logDebug } from "@tauri-apps/plugin-log"

function fmt(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ""}`
      if (typeof a === "string") return a
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(" ")
}

export const logger = {
  error: (...args: unknown[]) => {
    const msg = fmt(args)
    logError(msg).catch(() => {})
    if (import.meta.env.DEV) console.error(...args)
  },
  warn: (...args: unknown[]) => {
    const msg = fmt(args)
    logWarn(msg).catch(() => {})
    if (import.meta.env.DEV) console.warn(...args)
  },
  info: (...args: unknown[]) => {
    const msg = fmt(args)
    logInfo(msg).catch(() => {})
    if (import.meta.env.DEV) console.info(...args)
  },
  debug: (...args: unknown[]) => {
    const msg = fmt(args)
    logDebug(msg).catch(() => {})
    if (import.meta.env.DEV) console.debug(...args)
  },
}
