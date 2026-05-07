export type FsErrorKind =
  | "PermissionDenied"
  | "NotFound"
  | "AlreadyExists"
  | "NoSpace"
  | "InvalidName"
  | "PathEscape"
  | "NetworkError"
  | "Unknown"

export interface FsError {
  kind: FsErrorKind
  message: string
  raw: string
}

const PATTERNS: Array<[FsErrorKind, RegExp]> = [
  ["PermissionDenied", /permission denied|access is denied|operation not permitted|EACCES|EPERM/i],
  ["NotFound", /no such file|not found|ENOENT|cannot find/i],
  ["AlreadyExists", /already exists|EEXIST|file exists/i],
  ["NoSpace", /no space|disk full|ENOSPC/i],
  ["InvalidName", /nombre (vacío|reservado|inválido|con caracteres)|invalid name|carácter no permitido/i],
  ["PathEscape", /path escapa|path con|inaccesible|sin (directorio|nombre)/i],
  ["NetworkError", /network|connection|host|unreachable|timed out|ETIMEDOUT|EHOSTDOWN/i],
]

const MESSAGES: Record<FsErrorKind, string> = {
  PermissionDenied: "Permiso denegado",
  NotFound: "Archivo o directorio no encontrado",
  AlreadyExists: "Ya existe un elemento con ese nombre",
  NoSpace: "No hay espacio disponible en disco",
  InvalidName: "Nombre inválido",
  PathEscape: "Ruta no permitida",
  NetworkError: "Error de red o conexión",
  Unknown: "Error inesperado",
}

export function classifyFsError(e: unknown): FsError {
  const raw = e instanceof Error ? e.message : String(e)
  const kind =
    PATTERNS.find(([, re]) => re.test(raw))?.[0] ?? "Unknown"
  return {
    kind,
    message: MESSAGES[kind],
    raw,
  }
}

export function fsErrorMessage(e: unknown): string {
  const err = classifyFsError(e)
  return err.kind === "Unknown" ? err.raw : err.message
}
