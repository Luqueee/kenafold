export type UndoOp =
  | { type: "rename"; oldPath: string; newPath: string }
  | { type: "move"; moves: Array<{ from: string; to: string }> }

export function describeUndoOp(op: UndoOp): string {
  switch (op.type) {
    case "rename": {
      const name = op.oldPath.split("/").at(-1) ?? op.oldPath
      return `Deshacer renombrar "${name}"`
    }
    case "move": {
      const n = op.moves.length
      return n === 1
        ? `Deshacer mover "${op.moves[0].from.split("/").at(-1)}"`
        : `Deshacer mover ${n} elementos`
    }
  }
}
