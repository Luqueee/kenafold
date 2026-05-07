const KEY = "file-explorer:favorites"

export const favoritesStorage = {
  load(): string[] {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? "[]")
    } catch {
      return []
    }
  },
  save(paths: string[]) {
    localStorage.setItem(KEY, JSON.stringify(paths))
  },
}
