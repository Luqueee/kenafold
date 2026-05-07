const EXACT_NAMES = new Set([
  ".DS_Store",
  ".Spotlight-V100",
  ".Trashes",
  ".fseventsd",
  ".TemporaryItems",
  ".AppleDouble",
  ".AppleDB",
  ".AppleDesktop",
  ".VolumeIcon.icns",
  ".com.apple.timemachine.donotpresent",
  "Network Trash Folder",
  "Temporary Items",
])

export function isMacJunk(name: string): boolean {
  if (name.startsWith("._")) return true
  return EXACT_NAMES.has(name)
}
