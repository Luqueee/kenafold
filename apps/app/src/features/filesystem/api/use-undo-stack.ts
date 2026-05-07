import { useCallback, useRef, useState } from "react"
import type { UndoOp } from "../domain/undo-op"
import { fsGateway } from "../infra/fs.gateway"
import { logger } from "@/shared/lib/logger"
import { basename } from "../domain/path"

const MAX_STACK = 20

export function useUndoStack() {
  const [stack, setStack] = useState<UndoOp[]>([])
  const executingRef = useRef(false)

  const push = useCallback((op: UndoOp) => {
    setStack((prev) => [...prev.slice(-(MAX_STACK - 1)), op])
  }, [])

  const peek = stack[stack.length - 1] ?? null
  const canUndo = stack.length > 0

  const undo = useCallback(async (): Promise<boolean> => {
    if (executingRef.current) return false
    const op = stack[stack.length - 1]
    if (!op) return false

    executingRef.current = true
    try {
      if (op.type === "rename") {
        const name = basename(op.oldPath)
        await fsGateway.rename(op.newPath, name)
      } else if (op.type === "move") {
        for (const { from, to } of op.moves) {
          await fsGateway.move(to, from)
        }
      }
      setStack((prev) => prev.slice(0, -1))
      return true
    } catch (e) {
      logger.error("undo failed", e)
      return false
    } finally {
      executingRef.current = false
    }
  }, [stack])

  return { push, undo, canUndo, peek }
}
