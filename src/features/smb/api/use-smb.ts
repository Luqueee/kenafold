import { useCallback, useEffect, useState } from "react"
import { fsGateway } from "@/features/filesystem/infra/fs.gateway"
import type { SmbShare } from "../domain/share"
import { fsErrorMessage } from "@/features/filesystem/domain/fs-error"
import { logger } from "@/shared/lib/logger"

export function useSmb() {
  const [shares, setShares] = useState<SmbShare[]>([])
  const [mounted, setMounted] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  const refreshMounted = useCallback(async (list: SmbShare[]) => {
    const status: Record<string, boolean> = {}
    await Promise.all(
      list.map(async (s) => {
        try {
          status[s.id] = await fsGateway.smbIsMounted(s.id)
        } catch {
          status[s.id] = false
        }
      })
    )
    setMounted(status)
  }, [])

  const refresh = useCallback(async () => {
    const list = await fsGateway.smbList()
    setShares(list)
    await refreshMounted(list)
  }, [refreshMounted])

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    refresh()
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [refresh])

  useEffect(() => {
    const t = setInterval(() => {
      if (shares.length > 0) refreshMounted(shares)
    }, 4000)
    return () => clearInterval(t)
  }, [shares, refreshMounted])

  const setBusyFor = (id: string, v: boolean) =>
    setBusy((b) => ({ ...b, [id]: v }))

  const save = useCallback(
    async (share: SmbShare, password?: string) => {
      await fsGateway.smbSave(share, password)
      await refresh()
    },
    [refresh]
  )

  const remove = useCallback(
    async (id: string) => {
      await fsGateway.smbDelete(id)
      await refresh()
    },
    [refresh]
  )

  const mount = useCallback(
    async (id: string): Promise<string> => {
      setBusyFor(id, true)
      try {
        const path = await fsGateway.smbMount(id)
        await refresh()
        return path
      } catch (e) {
        logger.error("SMB mount failed", id, e)
        throw new Error(fsErrorMessage(e))
      } finally {
        setBusyFor(id, false)
      }
    },
    [refresh]
  )

  const unmount = useCallback(
    async (id: string): Promise<void> => {
      setBusyFor(id, true)
      try {
        await fsGateway.smbUnmount(id)
        await refresh()
      } catch (e) {
        logger.error("SMB unmount failed", id, e)
        throw new Error(fsErrorMessage(e))
      } finally {
        setBusyFor(id, false)
      }
    },
    [refresh]
  )

  return { shares, mounted, busy, refresh, save, remove, mount, unmount }
}
