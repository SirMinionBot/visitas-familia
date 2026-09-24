import { useEffect, useState } from 'react'
import type { DataLayer } from './data'
import type { Usuario } from './types'
import { STORAGE_KEYS } from './types'

interface Props {
  data: DataLayer
  usuarios: Usuario[]
  onElegido: (u: Usuario) => void
}

export default function SeleccionUsuario({ data, usuarios, onElegido }: Props) {
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
  }, [])

  async function elegir(u: Usuario) {
    localStorage.setItem(STORAGE_KEYS.usuarioId, u.id)
    onElegido(u)
  }

  async function crearYOelegir() {
    const nombre = nombreNuevo.trim()
    if (!nombre) return
    setError(null)
    try {
      const u = await data.crearUsuario(nombre)
      localStorage.setItem(STORAGE_KEYS.usuarioId, u.id)
      onElegido(u)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <main style={{ maxWidth: 480, margin: '0 auto', padding: '1.5rem' }} data-testid="seleccion-usuario">
      <h1>¿Quién eres?</h1>
      <p style={{ color: '#888' }}>
        Selecciona tu nombre de la lista familiar o crea uno nuevo si no apareces.
      </p>

      {error && <p style={{ color: '#f85149' }}>Error: {error}</p>}

      <ul style={{ listStyle: 'none', padding: 0 }} data-testid="lista-usuarios">
        {usuarios.map((u) => (
          <li key={u.id} style={{ margin: '0.5rem 0' }}>
            <button
              type="button"
              onClick={() => void elegir(u)}
              style={{ width: '100%', padding: '0.75rem', textAlign: 'left' }}
              data-testid={`usuario-${u.id}`}
            >
              {u.nombre}
            </button>
          </li>
        ))}
        {usuarios.length === 0 && (
          <li style={{ color: '#888', fontStyle: 'italic' }}>
            Aún no hay nadie. Crea el primer nombre abajo.
          </li>
        )}
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
            data-testid="input-nuevo-usuario"
          />
        </label>
        <button type="submit" style={{ marginLeft: '0.5rem', padding: '0.5rem 1rem' }} data-testid="btn-crear-usuario">
          Crear y entrar
        </button>
      </form>
    </main>
  )
}
