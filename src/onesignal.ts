// Integración con OneSignal Web SDK.
// Solo se activa si VITE_ONESIGNAL_APP_ID está definido. En modo mock se loggea en consola.

declare global {
  interface Window {
    OneSignal?: OneSignalAPI
  }
}

interface OneSignalAPI {
  init: (config: Record<string, unknown>) => Promise<void>
  getUserId: (cb: (id: string | null) => void) => void
}

let inicializado = false
let playerId: string | null = null

export async function initOneSignal(): Promise<void> {
  if (inicializado) return
  inicializado = true

  const appId = import.meta.env.VITE_ONESIGNAL_APP_ID
  if (!appId) {
    console.info('[onesignal] sin VITE_ONESIGNAL_APP_ID, modo mock inerte')
    return
  }

  // Carga perezosa del SDK para no inflar el bundle base si no se configura.
  await import('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js' as string).catch(
    (e) => {
      console.warn('[onesignal] fallo al cargar SDK', e)
    },
  )

  if (!window.OneSignal) {
    console.warn('[onesignal] SDK no disponible tras la carga')
    return
  }

  await window.OneSignal.init({ appId, allowLocalhostAsSecureOrigin: true })
  window.OneSignal.getUserId((id) => {
    playerId = id
    if (id) console.info('[onesignal] player_id registrado:', id)
  })
}

export function getPlayerId(): string | null {
  return playerId
}
