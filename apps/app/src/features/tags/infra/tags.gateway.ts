import { invoke } from "@tauri-apps/api/core"
import type { FileEntry } from "@/features/filesystem/domain/file-entry"

export const tagsGateway = {
  get: (path: string) => invoke<string[]>("tags_get", { path }),
  set: (path: string, tagId: string) => invoke<void>("tags_set", { path, tagId }),
  remove: (path: string, tagId: string) => invoke<void>("tags_remove", { path, tagId }),
  getAll: () => invoke<Record<string, string[]>>("tags_get_all"),
  getByTag: (tagId: string) => invoke<string[]>("tags_get_by_tag", { tagId }),
  getEntriesByTag: (tagId: string) => invoke<FileEntry[]>("tags_get_entries_by_tag", { tagId }),
}
