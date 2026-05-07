const KEY = "file-explorer:saved-searches"

export interface SavedSearch {
  id: string
  query: string
  mode: "name" | "content"
}

export const savedSearchesStorage = {
  load(): SavedSearch[] {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? "[]")
    } catch {
      return []
    }
  },
  save(searches: SavedSearch[]) {
    localStorage.setItem(KEY, JSON.stringify(searches))
  },
}
