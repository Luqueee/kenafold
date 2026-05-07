export interface OnboardingStep {
  title: string
  description: string
  hint?: string
  icon: string
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    icon: "🗂️",
    title: "Bienvenido a Kenafold",
    description:
      "Un explorador de archivos para macOS. Rápido, por teclado y sin distracciones.",
  },
  {
    icon: "⌨️",
    title: "Navegación por teclado",
    description:
      "Usa las flechas para moverte, Enter para abrir, Backspace para subir un nivel.",
    hint: "↑ ↓ para moverse · Enter para abrir · ← para subir",
  },
  {
    icon: "🔍",
    title: "Filtro inline",
    description:
      "Empieza a escribir cualquier cosa y los archivos se filtran al instante. Sin atajos extra.",
    hint: "Escribe directamente · / para enfocar · Escape para limpiar",
  },
  {
    icon: "⚡",
    title: "Búsqueda avanzada",
    description:
      "Busca por nombre o contenido en todo el directorio actual con búsqueda full-text.",
    hint: "⌘K para abrir la paleta de búsqueda",
  },
  {
    icon: "🪟",
    title: "Paneles divididos",
    description:
      "Abre dos paneles lado a lado para copiar, mover o comparar archivos entre directorios.",
    hint: "⌘T para dividir · ⌘` para cambiar panel activo",
  },
]

export const STORAGE_KEY = "kenafold:onboarding-done"
