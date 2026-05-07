import { useCallback, useState } from "react"
import { favoritesStorage } from "../infra/favorites.storage"

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(() =>
    favoritesStorage.load()
  )

  const add = useCallback((path: string) => {
    setFavorites((prev) => {
      if (prev.includes(path)) return prev
      const next = [...prev, path]
      favoritesStorage.save(next)
      return next
    })
  }, [])

  const remove = useCallback((path: string) => {
    setFavorites((prev) => {
      const next = prev.filter((p) => p !== path)
      favoritesStorage.save(next)
      return next
    })
  }, [])

  return {
    favorites,
    add,
    remove,
    isFavorite: (p: string) => favorites.includes(p),
  }
}
