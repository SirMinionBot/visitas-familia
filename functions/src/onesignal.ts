// Cliente mínimo de la REST API de OneSignal (https://api.onesignal.com) sobre fetch
// (Node 22). Sustituye al paquete `onesignal-node`, obsoleto y sin tipos válidos.
//
// Autenticación: cabecera `Authorization: Key <REST API key>` (claves nuevas de
// Settings → Keys & IDs). Los destinatarios se identifican con `include_subscription_ids`
// (en el modelo de datos siguen guardados en `usuarios.onesignal_player_ids`).

import { createHash } from 'node:crypto'
import * as logger from 'firebase-functions/logger'

const API = 'https://api.onesignal.com'
const REINTENTOS = 3

export interface Credenciales {
  appId: string
  apiKey: string
}

export interface Envio {
  subscriptionIds: string[]
  titulo: string
  cuerpo: string
  url?: string
  /** Si se indica, OneSignal lo entrega en ese instante (notificación programada). */
  enviarEn?: Date
  /**
   * Texto estable por envío lógico (p. ej. id del evento + motivo). Se convierte en el
   * `idempotency_key` de OneSignal para que un reintento o una reentrega del evento no
   * dupliquen la notificación.
   */
  clave?: string
}

interface Respuesta {
  status: number
  json: Record<string, unknown>
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Formato que documenta OneSignal para send_after: "2026-09-25 14:00:00 GMT+0000". */
export function formatoSendAfter(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} GMT+0000`
  )
}

/** OneSignal espera un UUID como idempotency_key: se deriva de forma determinista. */
export function claveIdempotencia(texto: string): string {
  const h = createHash('sha256').update(texto).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/** Petición con reintentos ante errores de red, 429 y 5xx. Nunca registra la API key. */
async function llamar(
  cred: Credenciales,
  method: 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<Respuesta> {
  let ultimoError: unknown
  for (let intento = 0; intento < REINTENTOS; intento++) {
    if (intento > 0) await espera(500 * 2 ** intento)
    try {
      const res = await fetch(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Key ${cred.apiKey}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
      })
      const texto = await res.text()
      let json: Record<string, unknown> = {}
      try {
        json = texto ? (JSON.parse(texto) as Record<string, unknown>) : {}
      } catch {
        json = { raw: texto.slice(0, 300) }
      }
      if (res.status === 429 || res.status >= 500) {
        ultimoError = new Error(`OneSignal respondió ${res.status}`)
        continue
      }
      return { status: res.status, json }
    } catch (e) {
      ultimoError = e
    }
  }
  throw ultimoError instanceof Error ? ultimoError : new Error(String(ultimoError))
}

/**
 * Crea una notificación push. Devuelve el id de OneSignal, o undefined si no se
 * envió a nadie (p. ej. todas las suscripciones están dadas de baja).
 * Lanza si la API rechaza la petición (credenciales erróneas, app id inválido...).
 */
export async function enviar(cred: Credenciales, e: Envio): Promise<string | undefined> {
  // Sin destinatarios OneSignal devolvería 400: se evita la llamada.
  const ids = [...new Set(e.subscriptionIds.filter((s) => typeof s === 'string' && s.length > 0))]
  if (ids.length === 0) return undefined

  const { status, json } = await llamar(cred, 'POST', '/notifications', {
    app_id: cred.appId,
    target_channel: 'push',
    include_subscription_ids: ids,
    headings: { en: e.titulo, es: e.titulo },
    contents: { en: e.cuerpo, es: e.cuerpo },
    ...(e.url ? { url: e.url } : {}),
    ...(e.clave ? { idempotency_key: claveIdempotencia(e.clave) } : {}),
    ...(e.enviarEn ? { send_after: formatoSendAfter(e.enviarEn) } : {}),
  })

  if (status < 200 || status >= 300) {
    throw new Error(`OneSignal rechazó la notificación (${status}): ${JSON.stringify(json.errors ?? json)}`)
  }
  if (json.errors) {
    // Suscripciones inválidas o dadas de baja: no es fatal, pero conviene verlo en los logs.
    logger.warn('OneSignal devolvió errores parciales', { errors: json.errors })
  }
  const id = typeof json.id === 'string' && json.id.length > 0 ? json.id : undefined
  if (!id) logger.warn('OneSignal no creó la notificación (sin destinatarios válidos)', { json })
  return id
}

/** Cancela una notificación programada. Idempotente: si ya salió o no existe, no falla. */
export async function cancelar(cred: Credenciales, notificationId: string): Promise<void> {
  const { status, json } = await llamar(
    cred,
    'DELETE',
    `/notifications/${encodeURIComponent(notificationId)}?app_id=${encodeURIComponent(cred.appId)}`,
  )
  if (status >= 200 && status < 300) return
  if (status === 400 || status === 404) {
    logger.info('Recordatorio ya no cancelable (enviado, cancelado o inexistente)', { status, json })
    return
  }
  throw new Error(`OneSignal no pudo cancelar la notificación (${status}): ${JSON.stringify(json)}`)
}
