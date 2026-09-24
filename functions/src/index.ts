// Cloud Functions (v2) que disparan las notificaciones push con OneSignal.
//
//   - turnosWritten: al crear/editar un turno avisa a los familiares y programa un
//     recordatorio 30 min antes del inicio (OneSignal `send_after`). Al editar cancela
//     el recordatorio anterior y crea otro; al borrar el turno lo cancela.
//   - notasCreated: al crear una nota marcada como alerta, push inmediato.
//
// Secretos (firebase functions:secrets:set): ONESIGNAL_APP_ID y ONESIGNAL_API_KEY.
// Pasos completos de despliegue en docs/ONESIGNAL.md.

import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore'
import { setGlobalOptions } from 'firebase-functions/v2'
import { defineSecret } from 'firebase-functions/params'
import * as logger from 'firebase-functions/logger'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { cancelar, enviar, type Credenciales } from './onesignal'

// Firestore está en eur3: los triggers deben vivir en su región (europe-west1).
// El despliegue fija automáticamente el trigger de Eventarc a la ubicación de la base.
setGlobalOptions({ region: 'europe-west1', maxInstances: 5 })

initializeApp()
const db = getFirestore()

const ONESIGNAL_APP_ID = defineSecret('ONESIGNAL_APP_ID')
const ONESIGNAL_API_KEY = defineSecret('ONESIGNAL_API_KEY')
const SECRETS = [ONESIGNAL_APP_ID, ONESIGNAL_API_KEY]

const URL_APP = 'https://sirminionbot.github.io/visitas-familia/'
const ZONA = 'Europe/Madrid' // las Functions corren en UTC; los textos se muestran en hora española
const ANTELACION_MS = 30 * 60 * 1000

// Modelo de datos: ver src/types.ts y firestore.rules.
interface TurnoDoc {
  usuario_ids?: string[]
  fecha_inicio?: string // ISO 8601 en UTC (toISOString() del cliente)
  fecha_fin?: string
  notas?: string
  creado_por?: string
}

interface UsuarioInfo {
  nombre: string
  subscriptionIds: string[]
}

function credenciales(): Credenciales | null {
  const appId = ONESIGNAL_APP_ID.value().trim()
  const apiKey = ONESIGNAL_API_KEY.value().trim()
  if (!appId || !apiKey) {
    logger.warn('Faltan los secretos ONESIGNAL_APP_ID / ONESIGNAL_API_KEY: no se envía nada')
    return null
  }
  return { appId, apiKey }
}

/** Todos los usuarios con sus suscripciones push (el campo se llama onesignal_player_ids). */
async function cargarUsuarios(): Promise<Map<string, UsuarioInfo>> {
  const snap = await db.collection('usuarios').get()
  const out = new Map<string, UsuarioInfo>()
  snap.forEach((doc) => {
    const d = doc.data()
    const ids = Array.isArray(d.onesignal_player_ids) ? (d.onesignal_player_ids as unknown[]) : []
    out.set(doc.id, {
      nombre: typeof d.nombre === 'string' && d.nombre ? d.nombre : 'Un familiar',
      subscriptionIds: ids.filter((s): s is string => typeof s === 'string' && s.length > 0),
    })
  })
  return out
}

function suscripcionesDe(usuarios: Map<string, UsuarioInfo>, uids: Iterable<string>): string[] {
  const out = new Set<string>()
  for (const uid of uids) usuarios.get(uid)?.subscriptionIds.forEach((s) => out.add(s))
  return [...out]
}

function fechaLegible(iso: string | undefined): string {
  const t = Date.parse(iso ?? '')
  if (Number.isNaN(t)) return '(fecha desconocida)'
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: ZONA,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(t))
}

function horaLegible(iso: string | undefined): string {
  const t = Date.parse(iso ?? '')
  if (Number.isNaN(t)) return '?'
  return new Intl.DateTimeFormat('es-ES', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' }).format(
    new Date(t),
  )
}

const listaUids = (t: TurnoDoc | undefined): string[] =>
  Array.isArray(t?.usuario_ids) ? t.usuario_ids.filter((u) => typeof u === 'string') : []

function cambioRelevante(a: TurnoDoc, b: TurnoDoc): boolean {
  return (
    a.fecha_inicio !== b.fecha_inicio ||
    a.fecha_fin !== b.fecha_fin ||
    [...listaUids(a)].sort().join(',') !== [...listaUids(b)].sort().join(',')
  )
}

// Los recordatorios programados viven en `recordatorios/{turnoId}` (solo Admin SDK; las
// reglas de Firestore deniegan el acceso a clientes). No se guardan en el propio turno
// para no volver a disparar el trigger.
const refRecordatorio = (tid: string) => db.collection('recordatorios').doc(tid)

async function cancelarRecordatorio(cred: Credenciales, tid: string): Promise<void> {
  const ref = refRecordatorio(tid)
  const snap = await ref.get()
  if (!snap.exists) return
  const id = snap.data()?.onesignal_id as string | undefined
  if (id) await cancelar(cred, id)
  await ref.delete()
}

export const turnosWritten = onDocumentWritten(
  { document: 'turnos/{tid}', secrets: SECRETS },
  async (event) => {
    const tid = event.params.tid
    const antes = event.data?.before.exists ? (event.data.before.data() as TurnoDoc) : undefined
    const despues = event.data?.after.exists ? (event.data.after.data() as TurnoDoc) : undefined
    const cred = credenciales()
    if (!cred) return

    // Turno borrado: solo hay que anular el recordatorio pendiente.
    if (!despues) {
      try {
        await cancelarRecordatorio(cred, tid)
      } catch (e) {
        logger.error('No se pudo cancelar el recordatorio del turno borrado', { tid, error: String(e) })
      }
      return
    }

    // Edición que no toca ni horario ni participantes (p. ej. solo `notas`): nada que avisar.
    if (antes && !cambioRelevante(antes, despues)) return

    const usuarios = await cargarUsuarios()
    const participantes = listaUids(despues)
    const nombres = participantes
      .map((u) => usuarios.get(u)?.nombre)
      .filter(Boolean)
      .join(', ')
    const cuando = `${fechaLegible(despues.fecha_inicio)}–${horaLegible(despues.fecha_fin)}`

    // 1) Aviso inmediato.
    //    Alta: a todos menos a quien lo creó. Edición: no sabemos quién editó (no hay auth),
    //    así que se avisa a los afectados (participantes antiguos y nuevos).
    try {
      const destinatarios = antes
        ? suscripcionesDe(usuarios, new Set([...listaUids(antes), ...participantes]))
        : suscripcionesDe(
            usuarios,
            [...usuarios.keys()].filter((u) => u !== despues.creado_por),
          )
      const quien = usuarios.get(despues.creado_por ?? '')?.nombre ?? 'Un familiar'
      await enviar(cred, {
        subscriptionIds: destinatarios,
        clave: `${event.id}-aviso`,
        titulo: antes ? 'Turno modificado' : 'Nuevo turno de visita',
        cuerpo: antes
          ? `${cuando}${nombres ? ` · ${nombres}` : ''}`
          : `${quien} ha creado un turno: ${cuando}${nombres ? ` (${nombres})` : ''}`,
        url: URL_APP,
      })
    } catch (e) {
      logger.error('Fallo al enviar el aviso inmediato del turno', { tid, error: String(e) })
    }

    // 2) Recordatorio: se anula el anterior (si lo hay) y se programa uno nuevo.
    try {
      await cancelarRecordatorio(cred, tid)
      // Si llegaron dos ediciones seguidas, se programa a partir del estado actual del
      // turno (y no del de este evento); si ya no existe, no queda recordatorio.
      const actualSnap = await db.collection('turnos').doc(tid).get()
      if (!actualSnap.exists) return
      const actual = actualSnap.data() as TurnoDoc
      const inicio = Date.parse(actual.fecha_inicio ?? '')
      if (Number.isNaN(inicio)) {
        logger.warn('fecha_inicio no válida, no se programa recordatorio', { tid, valor: actual.fecha_inicio })
        return
      }
      const enviarEn = new Date(inicio - ANTELACION_MS)
      if (enviarEn.getTime() <= Date.now() + 60_000) return // ya falta menos de 30 min (o pasó)
      const id = await enviar(cred, {
        subscriptionIds: suscripcionesDe(usuarios, listaUids(actual)),
        clave: `${event.id}-recordatorio`,
        titulo: 'Tu turno empieza pronto',
        cuerpo: `Empieza a las ${horaLegible(actual.fecha_inicio)} (en 30 minutos).`,
        url: URL_APP,
        enviarEn,
      })
      if (id) {
        await refRecordatorio(tid).set({
          onesignal_id: id,
          enviar_en: enviarEn.toISOString(),
          fecha_inicio: actual.fecha_inicio,
        })
      }
    } catch (e) {
      logger.error('Fallo al programar el recordatorio del turno', { tid, error: String(e) })
    }
  },
)

export const notasCreated = onDocumentCreated(
  { document: 'notas/{nid}', secrets: SECRETS },
  async (event) => {
    const data = event.data?.data()
    if (!data || data.es_alerta !== true) return
    const cred = credenciales()
    if (!cred) return
    try {
      const usuarios = await cargarUsuarios()
      const autor = typeof data.usuario_id === 'string' ? data.usuario_id : ''
      const texto = typeof data.texto === 'string' ? data.texto : ''
      await enviar(cred, {
        subscriptionIds: suscripcionesDe(
          usuarios,
          [...usuarios.keys()].filter((u) => u !== autor),
        ),
        clave: `${event.id}-alerta`,
        titulo: `Alerta de ${usuarios.get(autor)?.nombre ?? 'un familiar'}`,
        cuerpo: texto.length > 120 ? `${texto.slice(0, 117)}...` : texto,
        url: URL_APP,
      })
    } catch (e) {
      logger.error('Fallo al enviar la alerta', { nota: event.params.nid, error: String(e) })
    }
  },
)
