export interface SmbShare {
  id: string
  name: string
  host: string
  share: string
  username: string
  domain?: string | null
  auto_mount: boolean
}

export function smbMountPath(share: SmbShare): string {
  return `/Volumes/${share.share}`
}
