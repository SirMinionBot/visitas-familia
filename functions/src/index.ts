// Cloud Functions — STUB.
// Estas funciones están escritas pero NO se desplegarán hasta que:
//   1. Exista un proyecto Firebase real vinculado.
//   2. La cuenta esté en plan Blaze (obligatorio para desplegar, gratis dentro de cuotas).
//   3. Las variables de entorno ONESIGNAL_APP_ID y ONESIGNAL_API_KEY estén configuradas
//      con `firebase functions:secrets:set`.
//
// Lo que hacen, según el documento de requisitos (sección 5):
//   - turnosCreated: al crear/editar un turno, envía un push inmediato al resto de
//     usuarios y programa (vía OneSignal send_after) un recordatorio antes del inicio.
//   - notasCreated: al crear una nota marcada como alerta, envía un push inmediato.

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

admin.initializeApp()
const db = admin.firestore()

// Cliente OneSignal. Import dinámico para evitar fallo en build si la dependencia
// aún no está instalada en el momento de `tsc`.
async function getClient() {
  const { default: OneSignal } = await import('onesignal-node')
  return new OneSignal(
    process.env.ONESIGNAL_APP_ID || '',
    process.env.ONESIGNAL_API_KEY || '',
  )
}

async function playerIdsExcept(uidExcept: string): Promise<string[]> {
  const snap = await db.collection('usuarios').get()
  const ids: string[] = []
  snap.forEach((doc) => {
    if (doc.id === uidExcept) return
    const data = doc.data()
    const pids = (data.onesignal_player_ids as string[] | undefined) ?? []
    ids.push(...pids)
  })
  return ids
}

async function sendNow(playerIds: string[], title: string, body: string, url: string) {
  if (playerIds.length === 0) return
  const client = await getClient()
  // SDK antiguo (onesignal-node v3) usa createNotification; ver docs para migrar a v5+.
  await client.createNotification({
    contents: { en: body, es: body },
    headings: { en: title, es: title },
    include_player_ids: playerIds,
    url,
  })
}

async function sendAt(sendAfterIso: string, playerIds: string[], title: string, body: string) {
  if (playerIds.length === 0) return
  const client = await getClient()
  await client.createNotification({
    contents: { en: body, es: body },
    headings: { en: title, es: title },
    include_player_ids: playerIds,
    send_after: sendAfterIso,
  })
}

export const turnosCreated = functions.firestore
  .document('turnos/{tid}')
  .onWrite(async (change, ctx) => {
    const after = change.after.exists ? change.after.data() : null
    if (!after) return // borrado: no notificamos
    const creador = (after as admin.firestore.DocumentData).creado_por as string
    const inicio = (after as admin.firestore.DocumentData).fecha_inicio as string
    const userIds = ((after as admin.firestore.DocumentData).usuario_ids as string[]) ?? []

    const recipients = await playerIdsExcept(creador)
    const url = 'https://sirminionbot.github.io/visitas-familia/'
    await sendNow(
      recipients,
      'Nuevo turno de visita',
      'Un familiar ha creado o modificado un turno.',
      url,
    )

    // Recordatorio 30 min antes del inicio del turno para los usuarios del turno.
    const reminderIso = new Date(new Date(inicio).getTime() - 30 * 60 * 1000).toISOString()
    if (new Date(reminderIso).getTime() > Date.now()) {
      const playersTurno: string[] = []
      const usnap = await db.collection('usuarios').get()
      usnap.forEach((u) => {
        if (userIds.includes(u.id)) {
          const pids = (u.data().onesignal_player_ids as string[] | undefined) ?? []
          playersTurno.push(...pids)
        }
      })
      await sendAt(reminderIso, playersTurno, 'Tu turno empieza pronto', 'Empieza en 30 minutos.')
    }
  })

export const notasCreated = functions.firestore
  .document('notas/{nid}')
  .onCreate(async (snap) => {
    const data = snap.data()
    if (!data.es_alerta) return
    const creador = data.usuario_id as string
    const recipients = await playerIdsExcept(creador)
    await sendNow(
      recipients,
      'Nueva alerta',
      (data.texto as string).slice(0, 120),
      'https://sirminionbot.github.io/visitas-familia/',
    )
  })

void ctxWorkaround()
async function ctxWorkaround() {
  // referencia para que el linter no marque ctx como no usado si se elimina el uso arriba
  return functions
}
const ctx = {} as functions.EventContext
void ctx
