// Implementación Firestore de la capa de datos.

import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  arrayUnion,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore'
import { getDb } from './firebase'
import type { Usuario, Turno, Nota } from './types'
import type { DataLayer } from './data'

function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {}
  for (const k of Object.keys(obj) as (keyof T)[]) {
    if (obj[k] !== undefined) out[k] = obj[k]
  }
  return out
}

function usuarioFromDoc(id: string, data: Record<string, unknown>): Usuario {
  const ts = data.fecha_creacion as { toDate?: () => Date } | string | undefined
  return {
    id,
    nombre: (data.nombre as string) ?? '',
    onesignal_player_ids: (data.onesignal_player_ids as string[]) ?? [],
    fecha_creacion:
      ts && typeof (ts as { toDate?: () => Date }).toDate === 'function'
          ? ((ts as unknown as { toDate: () => Date }).toDate().toISOString())
          : new Date().toISOString(),
  }
}

function turnoFromDoc(id: string, data: Record<string, unknown>): Turno {
  return {
    id,
    usuario_ids: (data.usuario_ids as string[]) ?? [],
    fecha_inicio: (data.fecha_inicio as string) ?? '',
    fecha_fin: (data.fecha_fin as string) ?? '',
    notas: (data.notas as string) ?? undefined,
    creado_por: (data.creado_por as string) ?? '',
    fecha_creacion: new Date().toISOString(),
  }
}

function notaFromDoc(id: string, data: Record<string, unknown>): Nota {
  return {
    id,
    usuario_id: (data.usuario_id as string) ?? '',
    texto: (data.texto as string) ?? '',
    es_alerta: (data.es_alerta as boolean) ?? false,
    fecha_creacion: new Date().toISOString(),
  }
}

export function createFirestoreDataLayer(): DataLayer {
  return {
    async listarUsuarios() {
      const snap = await getDocs(collection(getDb(), 'usuarios'))
      const out = snap.docs.map((d) => usuarioFromDoc(d.id, d.data()))
      out.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      return out
    },

    async crearUsuario(nombre) {
      const ref = await addDoc(collection(getDb(), 'usuarios'), {
        nombre,
        onesignal_player_ids: [],
        fecha_creacion: serverTimestamp(),
      })
      return {
        id: ref.id,
        nombre,
        onesignal_player_ids: [],
        fecha_creacion: new Date().toISOString(),
      }
    },

    async agregarPlayerId(usuarioId, playerId) {
      await updateDoc(doc(getDb(), 'usuarios', usuarioId), {
        onesignal_player_ids: arrayUnion(playerId),
      })
    },

    async listarTurnos() {
      const snap = await getDocs(query(collection(getDb(), 'turnos'), orderBy('fecha_inicio')))
      return snap.docs.map((d) => turnoFromDoc(d.id, d.data()))
    },

    async crearTurno(input) {
      const ref = await addDoc(collection(getDb(), 'turnos'), {
        ...stripUndefined(input as Record<string, unknown>),
        fecha_creacion: serverTimestamp(),
      })
      return { ...input, id: ref.id, fecha_creacion: new Date().toISOString() }
    },

    async actualizarTurno(id, patch) {
      await updateDoc(doc(getDb(), 'turnos', id), stripUndefined(patch as Record<string, unknown>))
    },

    async eliminarTurno(id) {
      await deleteDoc(doc(getDb(), 'turnos', id))
    },

    async listarNotas() {
      const snap = await getDocs(query(collection(getDb(), 'notas'), orderBy('fecha_creacion', 'desc')))
      return snap.docs.map((d) => notaFromDoc(d.id, d.data()))
    },

    async crearNota(input) {
      const ref = await addDoc(collection(getDb(), 'notas'), {
        ...stripUndefined(input as Record<string, unknown>),
        fecha_creacion: serverTimestamp(),
      })
      return { ...input, id: ref.id, fecha_creacion: new Date().toISOString() }
    },

    async eliminarNota(id) {
      await deleteDoc(doc(getDb(), 'notas', id))
    },

    onUsuariosChange(cb) {
      return onSnapshot(collection(getDb(), 'usuarios'), (snap) => {
        const out = snap.docs.map((d) => usuarioFromDoc(d.id, d.data()))
        out.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        cb(out)
      })
    },

    onTurnosChange(cb) {
      return onSnapshot(
        query(collection(getDb(), 'turnos'), orderBy('fecha_inicio')),
        (snap) => cb(snap.docs.map((d) => turnoFromDoc(d.id, d.data()))),
      )
    },

    onNotasChange(cb) {
      return onSnapshot(
        query(collection(getDb(), 'notas'), orderBy('fecha_creacion', 'desc')),
        (snap) => cb(snap.docs.map((d) => notaFromDoc(d.id, d.data()))),
      )
    },
  }
}
