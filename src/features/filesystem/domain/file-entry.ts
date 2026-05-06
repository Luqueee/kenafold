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

/** Whether this entry is a supported archive (decompressible and/or previewable). */
export function isArchive(entry: FileEntry): boolean {
  if (entry.is_dir) return false
  const n = entry.name.toLowerCase()
  return (
    n.endsWith(".tar.zst") ||
    n.endsWith(".tar.gz") ||
    n.endsWith(".tar.bz2") ||
    n.endsWith(".tgz") ||
    n.endsWith(".tbz2") ||
    n.endsWith(".zst") ||
    n.endsWith(".gz") ||
    n.endsWith(".bz2") ||
    n.endsWith(".zip") ||
    n.endsWith(".tar") ||
    n.endsWith(".iso") ||
    n.endsWith(".7z") ||
    n.endsWith(".rar")
  )
}

/** Whether this entry looks like a runnable shell script (by extension only). */
export function isShellScript(entry: FileEntry): boolean {
  if (entry.is_dir) return false
  if (!entry.extension) return false
  return SHELL_EXTENSIONS.has(entry.extension.toLowerCase())
}
