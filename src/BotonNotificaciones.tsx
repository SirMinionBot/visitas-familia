import { useState, type CSSProperties } from 'react'
import { estadoPermiso, onesignalConfigurado, solicitarPermiso, type EstadoPermiso } from './onesignal'

// Botón "Activar notificaciones". Solo se muestra si hay VITE_ONESIGNAL_APP_ID.
// El permiso se pide aquí (gesto del usuario) porque iOS no permite pedirlo al cargar.
export default function BotonNotificaciones() {
  const [estado, setEstado] = useState<EstadoPermiso>(estadoPermiso)
  const [ocupado, setOcupado] = useState(false)

  if (!onesignalConfigurado) return null

  async function activar() {
    setOcupado(true)
    try {
      await solicitarPermiso()
    } finally {
      setEstado(estadoPermiso())
      setOcupado(false)
    }
  }

  const texto: CSSProperties = { color: '#888', fontSize: '0.8rem' }

  if (estado === 'granted') {
    return (
      <small style={texto} data-testid="notificaciones-activas">
        Notificaciones activadas
      </small>
    )
  }
  if (estado === 'denied') {
    return (
      <small style={texto} data-testid="notificaciones-bloqueadas">
        Notificaciones bloqueadas: actívalas en los ajustes del navegador.
      </small>
    )
  }
  if (estado === 'no-soportado') {
    return (
      <small style={texto} data-testid="notificaciones-no-soportadas">
        Para recibir avisos en iPhone, añade la app a la pantalla de inicio (Compartir → Añadir a
        pantalla de inicio).
      </small>
    )
  }
  return (
    <button type="button" onClick={() => void activar()} disabled={ocupado} data-testid="btn-notificaciones">
      Activar notificaciones
    </button>
  )
}
