import { Icon } from "@iconify/react"
import { Folder, File } from "lucide-react"

const FILENAME_ICON: Record<string, string> = {
  Dockerfile: "vscode-icons:file-type-docker",
  "docker-compose.yml": "vscode-icons:file-type-docker",
  "docker-compose.yaml": "vscode-icons:file-type-docker",
  ".gitignore": "vscode-icons:file-type-git",
  ".gitattributes": "vscode-icons:file-type-git",
  ".gitmodules": "vscode-icons:file-type-git",
  "package.json": "vscode-icons:file-type-npm",
  "package-lock.json": "vscode-icons:file-type-npm",
  "yarn.lock": "vscode-icons:file-type-yarn",
  "Cargo.toml": "vscode-icons:file-type-cargo",
  "Cargo.lock": "vscode-icons:file-type-cargo",
  "tsconfig.json": "vscode-icons:file-type-tsconfig",
  "jsconfig.json": "vscode-icons:file-type-jsconfig",
  ".env": "vscode-icons:file-type-dotenv",
  ".env.local": "vscode-icons:file-type-dotenv",
  ".env.development": "vscode-icons:file-type-dotenv",
  ".env.production": "vscode-icons:file-type-dotenv",
  ".editorconfig": "vscode-icons:file-type-editorconfig",
  LICENSE: "vscode-icons:file-type-license",
  "LICENSE.md": "vscode-icons:file-type-license",
  "schema.prisma": "vscode-icons:file-type-prisma",
}

const EXT_ICON: Record<string, string> = {
  ts: "vscode-icons:file-type-typescript",
  mts: "vscode-icons:file-type-typescript",
  cts: "vscode-icons:file-type-typescript",
  tsx: "vscode-icons:file-type-reactts",
  js: "vscode-icons:file-type-javascript",
  mjs: "vscode-icons:file-type-javascript",
  cjs: "vscode-icons:file-type-javascript",
  jsx: "vscode-icons:file-type-reactjs",
  html: "vscode-icons:file-type-html",
  htm: "vscode-icons:file-type-html",
  css: "vscode-icons:file-type-css",
  scss: "vscode-icons:file-type-scss",
  sass: "vscode-icons:file-type-sass",
  less: "vscode-icons:file-type-less",
  json: "vscode-icons:file-type-json",
  yaml: "vscode-icons:file-type-yaml",
  yml: "vscode-icons:file-type-yaml",
  toml: "vscode-icons:file-type-toml",
  xml: "vscode-icons:file-type-xml",
  md: "vscode-icons:file-type-markdown",
  mdx: "vscode-icons:file-type-mdx",
  txt: "vscode-icons:file-type-text",
  pdf: "vscode-icons:file-type-pdf2",
  doc: "vscode-icons:file-type-word",
  docx: "vscode-icons:file-type-word",
  xls: "vscode-icons:file-type-excel",
  xlsx: "vscode-icons:file-type-excel",
  ppt: "vscode-icons:file-type-powerpoint",
  pptx: "vscode-icons:file-type-powerpoint",
  py: "vscode-icons:file-type-python",
  pyw: "vscode-icons:file-type-python",
  rs: "vscode-icons:file-type-rust",
  go: "vscode-icons:file-type-go",
  java: "vscode-icons:file-type-java",
  c: "vscode-icons:file-type-c",
  cpp: "vscode-icons:file-type-cpp",
  cc: "vscode-icons:file-type-cpp",
  cxx: "vscode-icons:file-type-cpp",
  h: "vscode-icons:file-type-cppheader",
  hpp: "vscode-icons:file-type-cppheader",
  cs: "vscode-icons:file-type-csharp",
  rb: "vscode-icons:file-type-ruby",
  php: "vscode-icons:file-type-php",
  swift: "vscode-icons:file-type-swift",
  kt: "vscode-icons:file-type-kotlin",
  kts: "vscode-icons:file-type-kotlin",
  lua: "vscode-icons:file-type-lua",
  dart: "vscode-icons:file-type-dartlang",
  ex: "vscode-icons:file-type-elixir",
  exs: "vscode-icons:file-type-elixir",
  elm: "vscode-icons:file-type-elm",
  hs: "vscode-icons:file-type-haskell",
  scala: "vscode-icons:file-type-scala",
  pl: "vscode-icons:file-type-perl",
  pm: "vscode-icons:file-type-perl",
  r: "vscode-icons:file-type-r",
  clj: "vscode-icons:file-type-clojure",
  cljs: "vscode-icons:file-type-clojure",
  erl: "vscode-icons:file-type-erlang",
  hrl: "vscode-icons:file-type-erlang",
  vue: "vscode-icons:file-type-vue",
  svelte: "vscode-icons:file-type-svelte",
  sql: "vscode-icons:file-type-sql",
  graphql: "vscode-icons:file-type-graphql",
  gql: "vscode-icons:file-type-graphql",
  prisma: "vscode-icons:file-type-prisma",
  sh: "vscode-icons:file-type-shell",
  bash: "vscode-icons:file-type-shell",
  zsh: "vscode-icons:file-type-shell",
  fish: "vscode-icons:file-type-shell",
  ps1: "vscode-icons:file-type-powershell",
  pem: "vscode-icons:file-type-key",
  key: "vscode-icons:file-type-key",
  env: "vscode-icons:file-type-dotenv",
  png: "vscode-icons:file-type-image",
  jpg: "vscode-icons:file-type-image",
  jpeg: "vscode-icons:file-type-image",
  gif: "vscode-icons:file-type-image",
  webp: "vscode-icons:file-type-image",
  bmp: "vscode-icons:file-type-image",
  tiff: "vscode-icons:file-type-image",
  heic: "vscode-icons:file-type-image",
  ico: "vscode-icons:file-type-image",
  svg: "vscode-icons:file-type-svg",
  mp4: "vscode-icons:file-type-video",
  mov: "vscode-icons:file-type-video",
  avi: "vscode-icons:file-type-video",
  mkv: "vscode-icons:file-type-video",
  webm: "vscode-icons:file-type-video",
  m4v: "vscode-icons:file-type-video",
  mp3: "ph:music-note-fill",
  wav: "ph:music-note-fill",
  flac: "ph:music-note-fill",
  aac: "ph:music-note-fill",
  ogg: "ph:music-note-fill",
  m4a: "ph:music-note-fill",
  opus: "ph:music-note-fill",
  zip: "vscode-icons:file-type-zip",
  tar: "vscode-icons:file-type-zip",
  gz: "vscode-icons:file-type-zip",
  rar: "vscode-icons:file-type-zip",
  "7z": "vscode-icons:file-type-zip",
  bz2: "vscode-icons:file-type-zip",
  xz: "vscode-icons:file-type-zip",
}

interface Props {
  name: string
  isDir: boolean
  extension?: string | null
  size?: number
}

export function FileIcon({ name, isDir, extension, size = 16 }: Props) {
  const cls = `shrink-0`
  const style = { width: size, height: size }
  if (isDir)
    return (
      <Folder
        className={`${cls} fill-blue-300/40 text-blue-300`}
        style={style}
      />
    )

  const nameIcon = FILENAME_ICON[name]
  if (nameIcon) return <Icon icon={nameIcon} width={size} height={size} />

  const extIcon = extension ? EXT_ICON[extension] : null
  if (extIcon)
    return (
      <Icon
        icon={extIcon}
        width={size}
        height={size}
        style={extIcon.startsWith("ph:") ? { color: "oklch(0.75 0.12 290)" } : undefined}
      />
    )

  return <File className={`${cls} text-muted-foreground`} style={style} />
}
