export interface Tag {
  id: string
  name: string
  color: string
}

export const PRESET_TAGS: Tag[] = [
  { id: "red", name: "Rojo", color: "#ef4444" },
  { id: "orange", name: "Naranja", color: "#f97316" },
  { id: "yellow", name: "Amarillo", color: "#eab308" },
  { id: "green", name: "Verde", color: "#22c55e" },
  { id: "blue", name: "Azul", color: "#3b82f6" },
  { id: "purple", name: "Morado", color: "#a855f7" },
  { id: "gray", name: "Gris", color: "#6b7280" },
]

export function tagById(id: string): Tag | undefined {
  return PRESET_TAGS.find((t) => t.id === id)
}
