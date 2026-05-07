import { tagById } from "../domain/tag"

interface Props {
  tagId: string
  size?: "sm" | "md"
  title?: boolean
}

export function TagDot({ tagId, size = "sm", title = true }: Props) {
  const tag = tagById(tagId)
  if (!tag) return null
  const dim = size === "sm" ? "h-2 w-2" : "h-3 w-3"
  return (
    <span
      className={`inline-block shrink-0 rounded-full ${dim}`}
      style={{ backgroundColor: tag.color }}
      title={title ? tag.name : undefined}
    />
  )
}
