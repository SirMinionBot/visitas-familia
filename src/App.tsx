import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SeleccionUsuario from './SeleccionUsuario'
import CalendarioSemanal from './CalendarioSemanal'
import TablonNotas from './TablonNotas'
import type { Usuario } from './types'
import { STORAGE_KEYS } from './types'
import type { DataLayer } from './data'
import { getDataLayer } from './data'
import { initOneSignal, getPlayerId } from './onesignal'
import { firebaseConfigured } from './firebase'

function ShellUsuario({
  data,
  yo,
  usuarios,
  onSalir,
}: {
  data: DataLayer
  yo: Usuario
  usuarios: Usuario[]
  onSalir: () => void
}) {
  const [tab, setTab] = useState<'cal' | 'notas'>('cal')

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '1rem' }} data-testid="app-shell">
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.2rem', margin: 0 }}>Hola, {yo.nombre}</h1>
          <small style={{ color: '#888' }}>
            {firebaseConfigured ? 'Firestore' : 'Modo mock (local)'}
          </small>
        </div>
        <button type="button" onClick={onSalir} data-testid="btn-cambiar-usuario">
          Cambiar de usuario
        </button>
      </header>

      <nav style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0' }}>
        <button
          type="button"
          onClick={() => setTab('cal')}
          data-testid="tab-calendario"
          style={{ background: tab === 'cal' ? '#1f6feb' : undefined }}
        >
          Calendario
        </button>
        <button
          type="button"
          onClick={() => setTab('notas')}
          data-testid="tab-notas"
          style={{ background: tab === 'notas' ? '#1f6feb' : undefined }}
        >
          Notas y alertas
        </button>
      </nav>

      {tab === 'cal' ? (
        <CalendarioSemanal data={data} yo={yo} usuarios={usuarios} />
      ) : (
        <TablonNotas data={data} yo={yo} usuarios={usuarios} />
      )}
    </main>
  )
}

function App() {
  const [data, setData] = useState<DataLayer | null>(null)
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [restaurando, setRestaurando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let montado = true
    void (async () => {
      try {
        const dl = await getDataLayer()
        if (!montado) return
        setData(dl)
        // Suscripción a la lista de usuarios para el dropdown.
        const unsub = dl.onUsuariosChange((lista) => {
          setUsuarios(lista)
        })
        // Restaurar identidad desde localStorage si existe.
        const id = localStorage.getItem(STORAGE_KEYS.usuarioId)
        if (id) {
          const lista = await dl.listarUsuarios()
          const yo = lista.find((u) => u.id === id)
          if (yo) {
            setUsuario(yo)
            // Re-vincular player_id si OneSignal está listo.
            await initOneSignal()
            const pid = getPlayerId()
            if (pid) await dl.agregarPlayerId(yo.id, pid)
          } else {
            localStorage.removeItem(STORAGE_KEYS.usuarioId)
          }
        } else {
          await initOneSignal()
        }
        return unsub
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (montado) setRestaurando(false)
      }
    })()
    return () => {
      montado = false
    }
  }, [])

  function salir() {
    localStorage.removeItem(STORAGE_KEYS.usuarioId)
    setUsuario(null)
  }

  if (error) {
    return (
      <main style={{ maxWidth: 600, margin: '0 auto', padding: '1.5rem' }}>
        <h1>Error</h1>
        <pre style={{ background: '#161b22', padding: '1rem', overflow: 'auto' }}>{error}</pre>
      </main>
    )
  }

  if (restaurando || !data) return <p style={{ padding: '1.5rem' }}>Cargando…</p>

  return (
    <BrowserRouter basename="/visitas-familia">
      <Routes>
        <Route
          path="/*"
          element={
            usuario ? (
              <ShellUsuario data={data} yo={usuario} usuarios={usuarios} onSalir={salir} />
            ) : (
              <SeleccionUsuario
                data={data}
                usuarios={usuarios}
                onElegido={(u) => {
                  setUsuario(u)
                  void initOneSignal().then(() => {
                    const pid = getPlayerId()
                    if (pid) void data.agregarPlayerId(u.id, pid)
                  })
                }}
              />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
