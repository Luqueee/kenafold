import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import type { SmbShare } from "../domain/share"
import { Button, Input, Label, Checkbox, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@kenafold/ui"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: SmbShare | null
  onSave: (share: SmbShare, password?: string) => Promise<void>
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function AddSmbDialog({ open, onOpenChange, initial, onSave }: Props) {
  const { t } = useTranslation()
  const [name, setName] = useState("")
  const [host, setHost] = useState("")
  const [share, setShare] = useState("")
  const [username, setUsername] = useState("")
  const [domain, setDomain] = useState("")
  const [password, setPassword] = useState("")
  const [autoMount, setAutoMount] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    /* eslint-disable react-hooks/set-state-in-effect */
    setName(initial?.name ?? "")
    setHost(initial?.host ?? "")
    setShare(initial?.share ?? "")
    setUsername(initial?.username ?? "")
    setDomain(initial?.domain ?? "")
    setPassword("")
    setAutoMount(initial?.auto_mount ?? true)
    setError(null)
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, initial])

  const isEdit = Boolean(initial)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!host.trim() || !share.trim() || !username.trim()) {
      setError(t("smb.errorRequired"))
      return
    }
    if (!isEdit && !password) {
      setError(t("smb.errorPasswordRequired"))
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload: SmbShare = {
        id: initial?.id ?? newId(),
        name: name.trim() || `${host}/${share}`,
        host: host.trim(),
        share: share.trim(),
        username: username.trim(),
        domain: domain.trim() || null,
        auto_mount: autoMount,
      }
      await onSave(payload, password || undefined)
      onOpenChange(false)
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-[26rem] flex-col gap-4 p-6 sm:max-w-md">
        <SheetHeader className="p-0">
          <SheetTitle>{isEdit ? t("smb.editTitle") : t("smb.newTitle")}</SheetTitle>
          <SheetDescription>{t("smb.mountDescription")}</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smb-name">{t("smb.name")}</Label>
            <Input id="smb-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="NAS de casa" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smb-host">{t("smb.server")}</Label>
            <Input id="smb-host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.10 o nas.local" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smb-share">{t("smb.resource")}</Label>
            <Input id="smb-share" value={share} onChange={(e) => setShare(e.target.value)} placeholder="public" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smb-domain">{t("smb.domain")}</Label>
            <Input id="smb-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="WORKGROUP" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smb-user">{t("smb.user")}</Label>
            <Input id="smb-user" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smb-pass">
              {isEdit ? t("smb.passwordEdit") : t("smb.password")}
            </Label>
            <Input id="smb-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={autoMount} onCheckedChange={(v) => setAutoMount(Boolean(v))} />
            {t("smb.autoMount")}
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              {t("smb.cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t("smb.saving") : t("smb.save")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
