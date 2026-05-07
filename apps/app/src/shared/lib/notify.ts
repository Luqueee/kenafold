let permissionRequested = false

export async function nativeNotify(title: string, body?: string) {
  if (!("Notification" in window)) return
  if (Notification.permission === "denied") return

  if (Notification.permission !== "granted" && !permissionRequested) {
    permissionRequested = true
    const perm = await Notification.requestPermission()
    if (perm !== "granted") return
  } else if (Notification.permission !== "granted") {
    return
  }

  new Notification(title, { body, silent: false })
}
