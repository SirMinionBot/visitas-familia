import { useEffect, useState } from 'react'
import { collection, getDocs, addDoc, serverTimestamp, updateDoc, arrayUnion } from 'firebase/firestore'
import { getDb } from './firebase'
import { STORAGE_KEYS, type Usuario } from './types'

// Pantalla de selección/creación de usuario (sección 4 del documento de requisitos).
// Sin auth: la identidad se elige de la lista de nombres existentes o se crea una nueva.

export default function SeleccionUsuario({ onElegido }: { onElegido: (u: Usuario) => void }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void cargar()
  }, [])

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      const snap = await getDocs(collection(getDb(), 'usuarios'))
      const lista: Usuario[] = snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          nombre: (data.nombre as string) ?? '',
          onesignal_player_ids: (data.onesignal_player_ids as string[]) ?? [],
          fecha_creacion:
            data.fecha_creacion && typeof (data.fecha_creacion as { toDate?: () => Date }).toDate === 'function'
              ? ((data.fecha_creacion as unknown as { toDate: () => Date }).toDate().toISOString())
              : new Date().toISOString(),
        }
      })
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      setUsuarios(lista)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }

  async function elegir(u: Usuario) {
    localStorage.setItem(STORAGE_KEYS.usuarioId, u.id)
    // El player_id de OneSignal se añade cuando el usuario acepta notificaciones.
    // El SDK de OneSignal, una vez inicializado, lo añadiremos vía Cloud Function o
    // directamente desde el cliente (ver src/onesignal.ts cuando se implemente).
    onElegido(u)
  }

  async function crearYOelegir() {
    const nombre = nombreNuevo.trim()
    if (!nombre) return
    setError(null)
    try {
      const ref = await addDoc(collection(getDb(), 'usuarios'), {
        nombre,
        onesignal_player_ids: [],
        fecha_creacion: serverTimestamp(),
      })
      const u: Usuario = {
        id: ref.id,
        nombre,
        onesignal_player_ids: [],
        fecha_creacion: new Date().toISOString(),
      }
      localStorage.setItem(STORAGE_KEYS.usuarioId, u.id)
      onElegido(u)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function registrarPlayerId(usuarioId: string, playerId: string) {
    await updateDoc(
      // Reconstruimos la referencia a partir del id; evitamos importar doc/getDoc arriba.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (await import('firebase/firestore')).doc(getDb(), 'usuarios', usuarioId),
      { onesignal_player_ids: arrayUnion(playerId) },
    )
  }

  // Expuesto para que OneSignal lo use cuando el usuario acepte notificaciones.
  ;(globalThis as unknown as { __vfRegistrarPlayerId?: typeof registrarPlayerId }).__vfRegistrarPlayerId =
    registrarPlayerId

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: '1.5rem' }}>
      <h1>¿Quién eres?</h1>
      <p style={{ color: '#888' }}>
        Selecciona tu nombre de la lista familiar o crea uno nuevo si no apareces.
      </p>

      {cargando && <p>Cargando lista…</p>}
      {error && <p style={{ color: '#f85149' }}>Error: {error}</p>}

      {!cargando && (
        <>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {usuarios.map((u) => (
              <li key={u.id} style={{ margin: '0.5rem 0' }}>
                <button
                  type="button"
                  onClick={() => void elegir(u)}
                  style={{ width: '100%', padding: '0.75rem', textAlign: 'left' }}
                >
                  {u.nombre}
                </button>
              </li>
            ))}
          </ul>

          <hr style={{ margin: '1.5rem 0', borderColor: '#30363d' }} />

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void crearYOelegir()
            }}
          >
            <label>
              Nuevo nombre:{' '}
              <input
                type="text"
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                placeholder="p. ej. Marta"
                style={{ padding: '0.5rem', width: '70%' }}
              />
            </label>
            <button type="submit" style={{ marginLeft: '0.5rem', padding: '0.5rem 1rem' }}>
              Crear y entrar
            </button>
          </form>
        </>
      )}
    </main>
  )
}
