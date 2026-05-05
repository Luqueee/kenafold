import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { SmbShare } from "../domain/share"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: SmbShare | null
  onSave: (share: SmbShare, password?: string) => Promise<void>
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function AddSmbDialog({ open, onOpenChange, initial, onSave }: Props) {
  const [name, setName] = useState("")
  const [host, setHost] = useState("")
  const [share, setShare] = useState("")
  const [username, setUsername] = useState("")
  const [domain, setDomain] = useState("")
  const [password, setPassword] = useState("")
  const [autoMount, setAutoMount] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when sheet opens or editing target changes. setState-in-effect
  // here is the simplest expression — derived state would need a ref antipattern.
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
      setError("Servidor, recurso y usuario son obligatorios")
      return
    }
    if (!isEdit && !password) {
      setError("Contraseña requerida")
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
          <SheetTitle>{isEdit ? "Editar share SMB" : "Nuevo share SMB"}</SheetTitle>
          <SheetDescription>
            La unidad se monta a nivel del sistema en /Volumes.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smb-name">Nombre</Label>
            <Input
              id="smb-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="NAS de casa"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smb-host">Servidor</Label>
            <Input
              id="smb-host"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="192.168.1.10 o nas.local"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smb-share">Recurso</Label>
            <Input
              id="smb-share"
              value={share}
              onChange={(e) => setShare(e.target.value)}
              placeholder="public"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smb-domain">Dominio (opcional)</Label>
            <Input
              id="smb-domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="WORKGROUP"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smb-user">Usuario</Label>
            <Input
              id="smb-user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="smb-pass">
              Contraseña {isEdit ? "(dejar vacío para no cambiar)" : ""}
            </Label>
            <Input
              id="smb-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={autoMount}
              onCheckedChange={(v) => setAutoMount(Boolean(v))}
            />
            Montar al iniciar la app
          </label>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
