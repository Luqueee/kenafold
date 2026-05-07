import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import en from "./locales/en"
import es from "./locales/es"

export const SUPPORTED_LANGUAGES = ["en", "es"] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

const LANGUAGE_KEY = "file-explorer:language"

export function readStoredLanguage(): Language | null {
  if (typeof window === "undefined") return null
  const stored = window.localStorage.getItem(LANGUAGE_KEY)
  if (stored === "en" || stored === "es") return stored
  return null
}

export function writeStoredLanguage(lang: Language) {
  window.localStorage.setItem(LANGUAGE_KEY, lang)
}

i18n.use(initReactI18next).init({
  lng: readStoredLanguage() ?? "en",
  fallbackLng: "en",
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
