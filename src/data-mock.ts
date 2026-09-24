// Implementación mock de la capa de datos, en localStorage.
// Sirve para desarrollar y probar toda la UI sin proyecto Firebase.
// El "tiempo real" se simula con eventos 'storage' y un EventTarget interno.

import type { Usuario, Turno, Nota } from './types'
import type { DataLayer } from './data'

const KEYS = {
  usuarios: 'vf:mock:usuarios',
  turnos: 'vf:mock:turnos',
  notas: 'vf:mock:notas',
} as const

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function save<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
  // Disparamos storage manualmente para que otras pestañas/instancias lo vean.
  // (El evento 'storage' nativo solo se dispara entre pestañas distintas.)
  window.dispatchEvent(new CustomEvent('vf:mock:change', { detail: { key } }))
}

type Listener = () => void
const listeners = new Map<string, Set<Listener>>()
function subscribe(key: string, fn: Listener): () => void {
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  set.add(fn)
  return () => {
    set!.delete(fn)
  }
}

// Listener unificado para los dos mecanismos: storage entre pestañas y evento custom local.
if (typeof window !== 'undefined') {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as { key?: string } | undefined
    if (detail?.key) {
      listeners.get(detail.key)?.forEach((fn) => fn())
    } else {
      // storage nativo (entre pestañas)
      const storageEvent = e as StorageEvent
      if (storageEvent.key) listeners.get(storageEvent.key)?.forEach((fn) => fn())
    }
  }
  window.addEventListener('storage', handler)
  window.addEventListener('vf:mock:change', handler)
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export function createMockDataLayer(): DataLayer {
  return {
    async listarUsuarios() {
      const list = load<Usuario[]>(KEYS.usuarios, [])
      return [...list].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    },

    async crearUsuario(nombre) {
      const list = load<Usuario[]>(KEYS.usuarios, [])
      const u: Usuario = {
        id: uid(),
        nombre,
        onesignal_player_ids: [],
        fecha_creacion: new Date().toISOString(),
      }
      list.push(u)
      save(KEYS.usuarios, list)
      console.info('[mock] usuario creado:', u)
      return u
    },

    async agregarPlayerId(usuarioId, playerId) {
      const list = load<Usuario[]>(KEYS.usuarios, [])
      const i = list.findIndex((x) => x.id === usuarioId)
      if (i < 0) return
      if (!list[i].onesignal_player_ids.includes(playerId)) {
        list[i].onesignal_player_ids.push(playerId)
        save(KEYS.usuarios, list)
      }
    },

    async listarTurnos() {
      const list = load<Turno[]>(KEYS.turnos, [])
      return [...list].sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio))
    },

    async crearTurno(input) {
      const list = load<Turno[]>(KEYS.turnos, [])
      const t: Turno = { ...input, id: uid(), fecha_creacion: new Date().toISOString() }
      list.push(t)
      save(KEYS.turnos, list)
      console.info('[mock] turno creado (se programaría recordatorio a OneSignal):', t)
      return t
    },

    async actualizarTurno(id, patch) {
      const list = load<Turno[]>(KEYS.turnos, [])
      const i = list.findIndex((x) => x.id === id)
      if (i < 0) return
      list[i] = { ...list[i], ...patch }
      save(KEYS.turnos, list)
    },

    async eliminarTurno(id) {
      const list = load<Turno[]>(KEYS.turnos, [])
      save(
        KEYS.turnos,
        list.filter((x) => x.id !== id),
      )
    },

    async listarNotas() {
      const list = load<Nota[]>(KEYS.notas, [])
      return [...list].sort((a, b) => b.fecha_creacion.localeCompare(a.fecha_creacion))
    },

    async crearNota(input) {
      const list = load<Nota[]>(KEYS.notas, [])
      const n: Nota = { ...input, id: uid(), fecha_creacion: new Date().toISOString() }
      list.push(n)
      save(KEYS.notas, list)
      if (n.es_alerta) console.info('[mock] alerta creada (se enviaría push inmediato):', n)
      return n
    },

    async eliminarNota(id) {
      const list = load<Nota[]>(KEYS.notas, [])
      save(
        KEYS.notas,
        list.filter((x) => x.id !== id),
      )
    },

    onUsuariosChange(cb) {
      const fire = () => {
        this.listarUsuarios().then(cb)
      }
      const unsub = subscribe(KEYS.usuarios, fire)
      void fire()
      return unsub
    },

    onTurnosChange(cb) {
      const fire = () => {
        this.listarTurnos().then(cb)
      }
      const unsub = subscribe(KEYS.turnos, fire)
      void fire()
      return unsub
    },

    onNotasChange(cb) {
      const fire = () => {
        this.listarNotas().then(cb)
      }
      const unsub = subscribe(KEYS.notas, fire)
      void fire()
      return unsub
    },
  }
}
