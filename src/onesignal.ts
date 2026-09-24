// Integración con OneSignal Web SDK v16.
//
// - Sin VITE_ONESIGNAL_APP_ID todo queda inerte (no se carga nada de la red).
// - El SDK se carga con <script> y el patrón `OneSignalDeferred` (no vale `import()`).
// - No se pide permiso al arrancar: iOS exige un gesto del usuario y que la PWA esté
//   instalada en la pantalla de inicio. El permiso se pide desde `solicitarPermiso()`
//   (botón "Activar notificaciones").
// - En v16 ya no hay `player_id`: el identificador es el id de suscripción push
//   (`OneSignal.User.PushSubscription.id`). Se sigue guardando en
//   `usuarios.onesignal_player_ids` (nombre heredado del modelo) y las Cloud Functions
//   lo usan como `include_subscription_ids`.
// - vite-plugin-pwa ya ocupa el scope `/visitas-familia/`, así que el service worker de
//   OneSignal vive en un sub-scope propio (public/push/onesignal/OneSignalSDKWorker.js).

interface OneSignalSDK {
  init: (config: Record<string, unknown>) => Promise<void>
  Notifications: { requestPermission: () => Promise<boolean> }
  User: {
    PushSubscription: {
      id: string | null | undefined
      optIn: () => Promise<void>
      addEventListener: (
        event: 'change',
        listener: (change: { current: { id: string | null | undefined } }) => void,
      ) => void
    }
  }
}

declare global {
  interface Window {
    OneSignalDeferred?: Array<(os: OneSignalSDK) => void | Promise<void>>
  }
}

const SDK_URL = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'
const TIMEOUT_MS = 10_000

const appId = import.meta.env.VITE_ONESIGNAL_APP_ID as string | undefined
export const onesignalConfigurado = !!appId

export type EstadoPermiso = 'no-configurado' | 'no-soportado' | 'default' | 'granted' | 'denied'

let promesaInit: Promise<OneSignalSDK | null> | null = null
let sdk: OneSignalSDK | null = null
let playerId: string | null = null
const oyentes = new Set<(id: string) => void>()

function notificar(id: string | null | undefined) {
  if (!id) return
  playerId = id
  oyentes.forEach((cb) => cb(id))
}

/** Carga e inicializa el SDK. Idempotente y nunca lanza: resuelve null si no se puede. */
export function initOneSignal(): Promise<OneSignalSDK | null> {
  if (promesaInit) return promesaInit
  if (!appId) {
    console.info('[onesignal] sin VITE_ONESIGNAL_APP_ID, integración desactivada')
    return (promesaInit = Promise.resolve(null))
  }

  promesaInit = new Promise<OneSignalSDK | null>((resolve) => {
    // Un bloqueador de anuncios o falta de red no debe dejar nada colgado.
    const timer = setTimeout(() => {
      console.warn('[onesignal] el SDK no respondió a tiempo')
      resolve(null)
    }, TIMEOUT_MS)

    window.OneSignalDeferred = window.OneSignalDeferred || []
    window.OneSignalDeferred.push(async (os) => {
      try {
        const base = import.meta.env.BASE_URL // '/visitas-familia/'
        await os.init({
          appId,
          serviceWorkerPath: `${base}push/onesignal/OneSignalSDKWorker.js`,
          serviceWorkerParam: { scope: `${base}push/onesignal/` },
          allowLocalhostAsSecureOrigin: true,
        })
        sdk = os
        os.User.PushSubscription.addEventListener('change', (e) => notificar(e.current.id))
        notificar(os.User.PushSubscription.id)
        clearTimeout(timer)
        resolve(os)
      } catch (e) {
        console.warn('[onesignal] fallo al inicializar', e)
        clearTimeout(timer)
        resolve(null)
      }
    })

    const s = document.createElement('script')
    s.src = SDK_URL
    s.defer = true
    s.onerror = () => {
      console.warn('[onesignal] no se pudo cargar el SDK')
      clearTimeout(timer)
      resolve(null)
    }
    document.head.appendChild(s)
  })
  return promesaInit
}

/** Estado del permiso de notificaciones del navegador (sin depender del SDK). */
export function estadoPermiso(): EstadoPermiso {
  if (!onesignalConfigurado) return 'no-configurado'
  // iOS solo expone `Notification` cuando la PWA está instalada en la pantalla de inicio.
  if (typeof Notification === 'undefined') return 'no-soportado'
  return Notification.permission
}

/**
 * Pide permiso de notificaciones y suscribe el dispositivo. Debe llamarse desde un
 * gesto del usuario (clic). Devuelve true si queda concedido.
 */
export async function solicitarPermiso(): Promise<boolean> {
  const os = sdk ?? (await initOneSignal())
  if (!os) return false
  const ok = await os.Notifications.requestPermission()
  if (ok) {
    await os.User.PushSubscription.optIn()
    notificar(os.User.PushSubscription.id)
  }
  return ok
}

/**
 * Registra un callback que recibe el id de suscripción push de este dispositivo, ahora
 * (si ya existe) y cada vez que cambie. Devuelve la función para dejar de escuchar.
 */
export function escucharPlayerId(cb: (id: string) => void): () => void {
  oyentes.add(cb)
  if (playerId) cb(playerId)
  return () => {
    oyentes.delete(cb)
  }
}
