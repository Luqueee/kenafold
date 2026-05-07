import { useCallback, useState } from "react"
import { fsGateway } from "../infra/fs.gateway"
import { joinPath } from "../domain/path"
import type { Clipboard } from "../domain/clipboard"
import type { FileEntry } from "../domain/file-entry"
import { fsErrorMessage } from "../domain/fs-error"
import { logger } from "@/shared/lib/logger"
import type { useUndoStack } from "./use-undo-stack"

type UndoStack = ReturnType<typeof useUndoStack>

export function useFileOps(
  onMutate: () => Promise<void> | void,
  undoStack: UndoStack,
  onEntries?: (entries: FileEntry[], total: number) => void
) {
  const [opError, setOpError] = useState<string | null>(null)

  const wrap = useCallback(
    async (action: () => Promise<void>) => {
      try {
        await action()
        fsGateway.clearIndex().catch(() => {})
        await onMutate()
      } catch (e) {
        setOpError(fsErrorMessage(e))
      }
    },
    [onMutate]
  )

  return {
    opError,
    clearError: () => setOpError(null),

    rename: (src: string, newName: string) => {
      const parentDir = src.slice(0, src.lastIndexOf("/"))
      const newPath = `${parentDir}/${newName}`
      if (onEntries) {
        // Batch: rename + list in one roundtrip, skip separate reload.
        return (async () => {
          try {
            const page = await fsGateway.renameAndList(src, newName)
            fsGateway.clearIndex().catch(() => {})
            undoStack.push({ type: "rename", oldPath: src, newPath })
            onEntries(page.entries, page.total)
          } catch (e) {
            setOpError(fsErrorMessage(e))
          }
        })()
      }
      return wrap(async () => {
        await fsGateway.rename(src, newName)
        undoStack.push({ type: "rename", oldPath: src, newPath })
      })
    },

    renameMany: (renames: Array<{ src: string; newName: string }>) => {
      if (onEntries) {
        return (async () => {
          try {
            const page = await fsGateway.renameBulk(renames)
            fsGateway.clearIndex().catch(() => {})
            for (const { src, newName } of renames) {
              const parentDir = src.slice(0, src.lastIndexOf("/"))
              undoStack.push({ type: "rename", oldPath: src, newPath: `${parentDir}/${newName}` })
            }
            onEntries(page.entries, page.total)
          } catch (e) {
            setOpError(fsErrorMessage(e))
          }
        })()
      }
      return wrap(async () => {
        await fsGateway.renameBulk(renames)
        for (const { src, newName } of renames) {
          const parentDir = src.slice(0, src.lastIndexOf("/"))
          undoStack.push({ type: "rename", oldPath: src, newPath: `${parentDir}/${newName}` })
        }
      })
    },

    remove: (path: string) => wrap(() => fsGateway.delete(path)),

    mkdir: (parent: string, name: string) =>
      wrap(() => fsGateway.mkdir(joinPath(parent, name))),

    mkfile: (parent: string, name: string) =>
      wrap(() => fsGateway.mkfile(joinPath(parent, name))),

    paste: (clipboard: Clipboard, destDir: string) =>
      wrap(async () => {
        const moves: Array<{ from: string; to: string }> = []
        for (const src of clipboard.paths) {
          const srcName = src.split("/").at(-1) ?? "archivo"
          const dest = joinPath(destDir, srcName)
          if (clipboard.op === "cut") {
            await fsGateway.move(src, dest)
            moves.push({ from: src, to: dest })
          } else {
            await fsGateway.copy(src, dest)
          }
        }
        if (clipboard.op === "cut" && moves.length > 0) {
          undoStack.push({ type: "move", moves })
        }
      }),

    copy: (src: string, dest: string) =>
      wrap(() => fsGateway.copy(src, dest)),

    move: (src: string, dest: string) =>
      wrap(async () => {
        await fsGateway.move(src, dest)
        undoStack.push({ type: "move", moves: [{ from: src, to: dest }] })
      }),

    removeMany: (paths: string[]) =>
      wrap(() => fsGateway.deleteMany(paths)),

    open: (path: string) =>
      fsGateway.open(path).catch((e) => logger.error("open failed", e)),

    reveal: (path: string) =>
      fsGateway.reveal(path).catch((e) => setOpError(fsErrorMessage(e))),

    duplicate: (path: string) =>
      wrap(async () => {
        await fsGateway.duplicate(path)
      }),

    compress: (paths: string[], destDir: string, archiveName?: string, format?: string, level?: string) =>
      wrap(async () => {
        await fsGateway.compress(paths, destDir, archiveName ?? null, format ?? null, level ?? null)
      }),
  }
}
