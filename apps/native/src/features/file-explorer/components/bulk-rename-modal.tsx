import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import type { FileEntry } from "@/features/filesystem/domain/file-entry"
import { Button, Input } from "@kenafold/ui"

interface Props {
  entries: FileEntry[]
  onCommit: (renames: Array<{ src: string; newName: string }>) => void
  onCancel: () => void
}

type Mode = "pattern" | "find-replace"

const TODAY = new Date().toISOString().slice(0, 10)

function stemAndExt(name: string): [string, string] {
  const dot = name.lastIndexOf(".")
  if (dot > 0) return [name.slice(0, dot), name.slice(dot + 1)]
  return [name, ""]
}

function applyPattern(pattern: string, entry: FileEntry, index: number): string {
  const [stem, ext] = stemAndExt(entry.name)
  const result = pattern
    .replaceAll("{n}", String(index + 1))
    .replaceAll("{name}", stem)
    .replaceAll("{ext}", ext ? `.${ext}` : "")
    .replaceAll("{date}", TODAY)
  return result.trim()
}

function applyFindReplace(find: string, replace: string, isRegex: boolean, entry: FileEntry): string {
  if (!find) return entry.name
  try {
    if (isRegex) return entry.name.replace(new RegExp(find, "g"), replace)
    return entry.name.replaceAll(find, replace)
  } catch {
    return entry.name
  }
}

export function BulkRenameModal({ entries, onCommit, onCancel }: Props) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<Mode>("pattern")
  const [pattern, setPattern] = useState("{name}{ext}")
  const [find, setFind] = useState("")
  const [replace, setReplace] = useState("")
  const [isRegex, setIsRegex] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [mode])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCancel])

  const previews = useMemo((): Array<{ entry: FileEntry; newName: string }> => {
    return entries.map((entry, i) => ({
      entry,
      newName:
        mode === "pattern"
          ? applyPattern(pattern, entry, i)
          : applyFindReplace(find, replace, isRegex, entry),
    }))
  }, [entries, mode, pattern, find, replace, isRegex])

  const newNames = previews.map((p) => p.newName)
  const duplicates = newNames.filter((n, i) => newNames.indexOf(n) !== i)
  const hasDuplicates = duplicates.length > 0
  const hasEmpty = newNames.some((n) => !n)
  const hasChanges = previews.some((p) => p.newName !== p.entry.name)
  const canApply = !hasDuplicates && !hasEmpty && hasChanges
  const changedCount = previews.filter((p) => p.newName !== p.entry.name).length

  const handleApply = () => {
    const renames = previews
      .filter((p) => p.newName !== p.entry.name)
      .map((p) => ({ src: p.entry.path, newName: p.newName }))
    onCommit(renames)
  }

  const tokens: Array<[string, string]> = [
    ["{name}", t("bulkRename.tokenStem")],
    ["{ext}", t("bulkRename.tokenExt")],
    ["{n}", t("bulkRename.tokenIndex")],
    ["{date}", t("bulkRename.tokenDate")],
  ]

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="flex w-[560px] max-w-[95vw] flex-col rounded-lg border border-border bg-popover shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-medium">
            {t("bulkRename.title", { count: entries.length })}
          </span>
          <div className="flex gap-1 rounded-md bg-muted p-0.5 text-xs">
            <button
              className={`rounded px-2.5 py-1 transition-colors ${mode === "pattern" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setMode("pattern")}
            >
              {t("bulkRename.patternMode")}
            </button>
            <button
              className={`rounded px-2.5 py-1 transition-colors ${mode === "find-replace" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setMode("find-replace")}
            >
              {t("bulkRename.findReplaceMode")}
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-2 px-4 py-3">
          {mode === "pattern" ? (
            <>
              <Input
                ref={inputRef}
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                placeholder="{name}{ext}"
                className="h-8 font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {t("bulkRename.tokens")}{" "}
                {tokens.map(([token, desc]) => (
                  <span key={token}>
                    <code className="rounded bg-muted px-1">{token}</code>{" "}
                    {desc}
                    {"  "}
                  </span>
                ))}
              </p>
            </>
          ) : (
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  ref={inputRef}
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                  placeholder={t("bulkRename.searchPlaceholder")}
                  className="h-8 pr-16 font-mono text-sm"
                />
                <button
                  className={`absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-xs transition-colors ${isRegex ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setIsRegex((v) => !v)}
                >
                  .*
                </button>
              </div>
              <Input
                value={replace}
                onChange={(e) => setReplace(e.target.value)}
                placeholder={t("bulkRename.replacePlaceholder")}
                className="h-8 flex-1 font-mono text-sm"
              />
            </div>
          )}
        </div>

        {/* Preview list */}
        <div className="max-h-64 overflow-y-auto border-y border-border">
          {previews.map(({ entry, newName }) => {
            const unchanged = newName === entry.name
            const isDup = duplicates.includes(newName) && !unchanged
            const isEmpty = !newName
            return (
              <div
                key={entry.path}
                className="flex items-center gap-2 px-4 py-1.5 text-xs odd:bg-muted/30"
              >
                <span className="w-[45%] truncate text-muted-foreground">{entry.name}</span>
                <span className="shrink-0 text-muted-foreground">→</span>
                <span
                  className={`flex-1 truncate font-medium ${
                    isEmpty ? "text-destructive"
                      : isDup ? "text-amber-500"
                      : unchanged ? "text-muted-foreground"
                      : "text-foreground"
                  }`}
                >
                  {isEmpty ? t("bulkRename.empty") : newName}
                </span>
                {isDup && <span className="shrink-0 text-xs text-amber-500">dup</span>}
              </div>
            )
          })}
        </div>

        {/* Errors */}
        {(hasDuplicates || hasEmpty) && (
          <p className="px-4 py-2 text-xs text-destructive">
            {hasEmpty && t("bulkRename.errorEmpty")}
            {hasDuplicates && t("bulkRename.errorDuplicates")}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-xs text-muted-foreground">
            {hasChanges ? t("bulkRename.changesCount", { count: changedCount }) : t("bulkRename.noChanges")}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {t("bulkRename.cancel")}
            </Button>
            <Button size="sm" disabled={!canApply} onClick={handleApply}>
              {t("bulkRename.apply")}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
