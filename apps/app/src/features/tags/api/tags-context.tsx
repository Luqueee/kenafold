import { createContext, useContext, type ReactNode } from "react"
import { useTagsDb } from "./use-tags-db"

type TagsApi = ReturnType<typeof useTagsDb>

const TagsCtx = createContext<TagsApi | null>(null)

export function TagsProvider({ children }: { children: ReactNode }) {
  const db = useTagsDb()
  return <TagsCtx.Provider value={db}>{children}</TagsCtx.Provider>
}

export function useTags(): TagsApi {
  const v = useContext(TagsCtx)
  if (!v) throw new Error("useTags must be used inside TagsProvider")
  return v
}
