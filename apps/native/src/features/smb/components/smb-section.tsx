import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Network, Plus, Unplug, Plug, Pencil, Trash2, Loader2 } from "lucide-react"

import { AddSmbDialog } from "./add-smb-dialog"
import { useSmb } from "../api/use-smb"
import { smbMountPath, type SmbShare } from "../domain/share"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
  SidebarGroup, SidebarGroupAction, SidebarGroupLabel, SidebarMenu,
  SidebarMenuAction, SidebarMenuButton, SidebarMenuItem,
} from "@kenafold/ui"

interface Props {
  currentPath: string
  onNavigate: (path: string) => void
}

export function SmbSection({ currentPath, onNavigate }: Props) {
  const { t } = useTranslation()
  const { shares, mounted, busy, save, remove, mount, unmount } = useSmb()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SmbShare | null>(null)
  const [error, setError] = useState<string | null>(null)

  const openNew = () => { setEditing(null); setDialogOpen(true) }
  const openEdit = (s: SmbShare) => { setEditing(s); setDialogOpen(true) }

  const handleClick = async (s: SmbShare) => {
    setError(null)
    try {
      if (mounted[s.id]) onNavigate(smbMountPath(s))
      else { const path = await mount(s.id); onNavigate(path) }
    } catch (e) { setError(String(e)) }
  }

  const handleUnmount = async (s: SmbShare) => {
    setError(null)
    try { await unmount(s.id) }
    catch (e) { setError(String(e)) }
  }

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>{t("smb.network")}</SidebarGroupLabel>
        <SidebarGroupAction title={t("smb.addShare")} onClick={openNew}>
          <Plus />
        </SidebarGroupAction>
        <SidebarMenu>
          {shares.length === 0 && (
            <li className="px-2 py-1 text-xs text-muted-foreground">
              {t("smb.noShares")}
            </li>
          )}
          {shares.map((s) => {
            const isMounted = mounted[s.id]
            const isBusy = busy[s.id]
            const path = smbMountPath(s)
            const active = currentPath === path
            return (
              <SidebarMenuItem key={s.id} className="group/smb">
                <SidebarMenuButton isActive={active} onClick={() => handleClick(s)} title={`smb://${s.host}/${s.share}`}>
                  {isBusy ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  ) : (
                    <Network className={`h-4 w-4 shrink-0 ${isMounted ? "text-primary" : "text-muted-foreground"}`} />
                  )}
                  <span className="flex-1 truncate">{s.name}</span>
                </SidebarMenuButton>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuAction
                      onClick={(e) => e.stopPropagation()}
                      title={t("smb.options")}
                      className="opacity-0 group-hover/smb:opacity-100 data-[state=open]:opacity-100"
                    >
                      <span className="text-xs">⋯</span>
                    </SidebarMenuAction>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                    {isMounted ? (
                      <DropdownMenuItem onClick={() => handleUnmount(s)}>
                        <Unplug className="h-4 w-4" />{t("smb.unmount")}
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => handleClick(s)}>
                        <Plug className="h-4 w-4" />{t("smb.mount")}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => openEdit(s)}>
                      <Pencil className="h-4 w-4" />{t("smb.edit")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => remove(s.id)} variant="destructive">
                      <Trash2 className="h-4 w-4" />{t("smb.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            )
          })}
          {error && <li className="px-2 py-1 text-xs text-destructive">{error}</li>}
        </SidebarMenu>
      </SidebarGroup>
      <AddSmbDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} onSave={save} />
    </>
  )
}
