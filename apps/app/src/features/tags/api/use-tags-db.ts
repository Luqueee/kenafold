import { useState, useCallback, useEffect } from "react"
import { tagsGateway } from "../infra/tags.gateway"
import { PRESET_TAGS } from "../domain/tag"

export function useTagsDb() {
  const [tagsMap, setTagsMap] = useState<Map<string, string[]>>(new Map())

  const loadAll = useCallback(async () => {
    try {
      const all = await tagsGateway.getAll()
      setTagsMap(new Map(Object.entries(all)))
    } catch (e) {
      console.error("tags loadAll failed", e)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const getTagsForPath = useCallback(
    (path: string) => tagsMap.get(path) ?? [],
    [tagsMap]
  )

  const addTag = useCallback(async (path: string, tagId: string) => {
    await tagsGateway.set(path, tagId)
    setTagsMap((prev) => {
      const next = new Map(prev)
      const existing = next.get(path) ?? []
      if (!existing.includes(tagId)) next.set(path, [...existing, tagId])
      return next
    })
  }, [])

  const removeTag = useCallback(async (path: string, tagId: string) => {
    await tagsGateway.remove(path, tagId)
    setTagsMap((prev) => {
      const next = new Map(prev)
      const existing = next.get(path) ?? []
      next.set(path, existing.filter((t) => t !== tagId))
      return next
    })
  }, [])

  const toggleTag = useCallback(
    async (path: string, tagId: string) => {
      const existing = tagsMap.get(path) ?? []
      if (existing.includes(tagId)) await removeTag(path, tagId)
      else await addTag(path, tagId)
    },
    [tagsMap, addTag, removeTag]
  )

  const getUsedTags = useCallback(() => {
    const used = new Set<string>()
    for (const tagIds of tagsMap.values()) tagIds.forEach((t) => used.add(t))
    return PRESET_TAGS.filter((t) => used.has(t.id))
  }, [tagsMap])

  return { tagsMap, getTagsForPath, addTag, removeTag, toggleTag, getUsedTags }
}
