import { useRef, useLayoutEffect, useState } from "react"
import { createPortal } from "react-dom"
import { Check } from "lucide-react"
import { PRESET_TAGS } from "../domain/tag"
import { useTags } from "../api/tags-context"

interface Props {
  paths: string[]
  x: number
  y: number
  onClose: () => void
}

export function TagPickerPortal({ paths, x, y, onClose }: Props) {
  const { getTagsForPath, toggleTag } = useTags()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState({ x, y })

  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 8
    let nx = x
    let ny = y
    if (nx + rect.width > window.innerWidth - margin)
      nx = Math.max(margin, window.innerWidth - rect.width - margin)
    if (ny + rect.height > window.innerHeight - margin)
      ny = Math.max(margin, window.innerHeight - rect.height - margin)
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y])

  const activeTagIds = (() => {
    if (paths.length === 0) return new Set<string>()
    const sets = paths.map((p) => new Set(getTagsForPath(p)))
    return sets.reduce((acc, s) => new Set([...acc].filter((t) => s.has(t))))
  })()

  const handleToggle = async (tagId: string) => {
    await Promise.all(paths.map((p) => toggleTag(p, tagId)))
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div
        ref={menuRef}
        className="fixed z-50 rounded-lg border border-border/80 bg-popover p-3 shadow-xl"
        style={{ left: pos.x, top: pos.y }}
      >
        <p className="mb-2 text-xs font-medium text-muted-foreground">Etiquetar</p>
        <div className="flex flex-col gap-1">
          {PRESET_TAGS.map((tag) => {
            const active = activeTagIds.has(tag.id)
            return (
              <button
                key={tag.id}
                onClick={() => handleToggle(tag.id)}
                className="flex items-center gap-2.5 rounded px-2 py-1.5 text-sm hover:bg-accent"
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="flex-1 text-left">{tag.name}</span>
                {active && <Check className="h-3 w-3 text-muted-foreground" />}
              </button>
            )
          })}
        </div>
      </div>
    </>,
    document.body
  )
}
