import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SeleccionUsuario from './SeleccionUsuario'
import type { Usuario } from './types'
import { STORAGE_KEYS } from './types'
import { getDb } from './firebase'
import { doc, getDoc } from 'firebase/firestore'

function ShellUsuario({ usuario, onSalir }: { usuario: Usuario; onSalir: () => void }) {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '1.4rem', margin: 0 }}>Hola, {usuario.nombre}</h1>
        <button type="button" onClick={onSalir} style={{ padding: '0.4rem 0.8rem' }}>
          Cambiar de usuario
        </button>
      </header>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Calendario semanal</h2>
        <p style={{ color: '#888' }}>
          Vista principal del documento (sección 2.3). Pendiente de implementar: crear, editar y
          eliminar turnos de visita.
        </p>
        <div
          style={{
            border: '1px dashed #30363d',
            padding: '1rem',
            borderRadius: 8,
            color: '#888',
          }}
        >
          (próximo paso)
        </div>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>Tablón de notas y alertas</h2>
        <p style={{ color: '#888' }}>
          Pendiente de implementar: añadir notas y marcarlas como alerta para notificación push.
        </p>
        <div
          style={{
            border: '1px dashed #30363d',
            padding: '1rem',
            borderRadius: 8,
            color: '#888',
          }}
        >
          (próximo paso)
        </div>
      </section>
    </main>
  )
}

function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [restaurando, setRestaurando] = useState(true)

  useEffect(() => {
    void restaurar()
  }, [])

  async function restaurar() {
    const id = localStorage.getItem(STORAGE_KEYS.usuarioId)
    if (!id) {
      setRestaurando(false)
      return
    }
    try {
      const snap = await getDoc(doc(getDb(), 'usuarios', id))
      if (snap.exists()) {
        const data = snap.data()
        setUsuario({
          id: snap.id,
          nombre: (data.nombre as string) ?? '',
          onesignal_player_ids: (data.onesignal_player_ids as string[]) ?? [],
          fecha_creacion: new Date().toISOString(),
        })
      } else {
        localStorage.removeItem(STORAGE_KEYS.usuarioId)
      }
    } catch (e) {
      console.warn('No se pudo restaurar la sesión:', e)
    } finally {
      setRestaurando(false)
    }
  }

  function salir() {
    localStorage.removeItem(STORAGE_KEYS.usuarioId)
    setUsuario(null)
  }

  if (restaurando) return <p style={{ padding: '1.5rem' }}>Cargando…</p>

  return (
    <BrowserRouter basename="/visitas-familia">
      <Routes>
        <Route
          path="/*"
          element={
            usuario ? (
              <ShellUsuario usuario={usuario} onSalir={salir} />
            ) : (
              <SeleccionUsuario onElegido={setUsuario} />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
