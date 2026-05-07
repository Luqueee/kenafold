import { useEffect, useRef } from "react"

interface Props {
  value: string
  onChange: (value: string) => void
  onCommit: () => void
  onCancel: () => void
  placeholder?: string
  autoSelect?: boolean
}

export function InlineEditInput({
  value,
  onChange,
  onCommit,
  onCancel,
  placeholder,
  autoSelect,
}: Props) {
  const ref = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      if (autoSelect) ref.current?.select()
      else ref.current?.focus()
    }, 0)
    return () => clearTimeout(t)
  }, [autoSelect])

  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          onCommit()
        }
        if (e.key === "Escape") {
          e.preventDefault()
          onCancel()
        }
      }}
      placeholder={placeholder}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      className="flex-1 rounded border border-primary/60 bg-background px-1.5 py-0.5 text-sm outline-none"
    />
  )
}
