export interface Clipboard {
  paths: string[]
  op: "copy" | "cut"
}

/** Path representativo para UI (primer item). */
export function clipboardPrimaryPath(c: Clipboard): string {
  return c.paths[0] ?? ""
}
