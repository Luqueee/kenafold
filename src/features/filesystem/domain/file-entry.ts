export interface FileEntry {
  name: string
  path: string
  is_dir: boolean
  size: number
  modified: number
  extension: string | null
}

export interface SearchResult {
  name: string
  path: string
  is_dir: boolean
  size: number
  modified: number
  extension: string | null
  score: number
}

const SHELL_EXTENSIONS = new Set([
  "sh",
  "bash",
  "zsh",
  "fish",
  "ksh",
  "csh",
  "command",
])

/** Whether this entry is a decompressible archive (.zst or .tar.zst). */
export function isArchive(entry: FileEntry): boolean {
  if (entry.is_dir) return false
  const n = entry.name.toLowerCase()
  return n.endsWith(".tar.zst") || n.endsWith(".zst")
}

/** Whether this entry looks like a runnable shell script (by extension only). */
export function isShellScript(entry: FileEntry): boolean {
  if (entry.is_dir) return false
  if (!entry.extension) return false
  return SHELL_EXTENSIONS.has(entry.extension.toLowerCase())
}
