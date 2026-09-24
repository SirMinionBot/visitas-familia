// Capa de datos. Interfaz única para que el resto del código no sepa si está hablando
// con Firestore real o con el backing store local (modo mock para dev sin credenciales).
//
// Modo mock se activa cuando VITE_FIREBASE_PROJECT_ID no está definido. En ese caso,
// los datos viven en localStorage y las "notificaciones" se loggean en consola.
// Esto permite iterar la UI completa sin tocar la consola de Firebase.

import type { Usuario, Turno, Nota } from './types'

export interface DataLayer {
  // usuarios
  listarUsuarios(): Promise<Usuario[]>
  crearUsuario(nombre: string): Promise<Usuario>
  agregarPlayerId(usuarioId: string, playerId: string): Promise<void>

  // turnos
  listarTurnos(): Promise<Turno[]>
  crearTurno(input: Omit<Turno, 'id' | 'fecha_creacion'>): Promise<Turno>
  actualizarTurno(id: string, patch: Partial<Omit<Turno, 'id' | 'fecha_creacion'>>): Promise<void>
  eliminarTurno(id: string): Promise<void>

  // notas
  listarNotas(): Promise<Nota[]>
  crearNota(input: Omit<Nota, 'id' | 'fecha_creacion'>): Promise<Nota>
  eliminarNota(id: string): Promise<void>

  // suscripciones en tiempo real (devuelve función de unsubscribe)
  onUsuariosChange(cb: (usuarios: Usuario[]) => void): () => void
  onTurnosChange(cb: (turnos: Turno[]) => void): () => void
  onNotasChange(cb: (notas: Nota[]) => void): () => void
}

// Ligero a propósito: no importa Firebase, para que no acabe en el bundle inicial.
export const firebaseConfigured = !!import.meta.env.VITE_FIREBASE_PROJECT_ID

export async function getDataLayer(): Promise<DataLayer> {
  if (firebaseConfigured) {
    const { createFirestoreDataLayer } = await import('./data-firestore')
    return createFirestoreDataLayer()
  }
  const { createMockDataLayer } = await import('./data-mock')
  return createMockDataLayer()
}
