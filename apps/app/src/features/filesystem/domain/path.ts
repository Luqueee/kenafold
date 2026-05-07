export interface PathSegment {
  label: string
  path: string
}

export function pathSegments(path: string): PathSegment[] {
  if (path === "/") return [{ label: "/", path: "/" }]
  const parts = path.split("/").filter(Boolean)
  return [
    { label: "/", path: "/" },
    ...parts.map((label, i) => ({
      label,
      path: "/" + parts.slice(0, i + 1).join("/"),
    })),
  ]
}

export function parentPath(path: string): string | null {
  if (path === "/") return null
  const parts = path.split("/").filter(Boolean)
  if (parts.length === 0) return null
  const parent = "/" + parts.slice(0, -1).join("/")
  return parent || "/"
}

export function joinPath(dir: string, name: string): string {
  return dir === "/" ? `/${name}` : `${dir}/${name}`
}

export function basename(path: string): string {
  return path.split("/").filter(Boolean).at(-1) ?? path
}
