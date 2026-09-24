import { useEffect, useState } from 'react'
import type { DataLayer } from './data'
import type { Nota, Usuario } from './types'

interface Props {
  data: DataLayer
  yo: Usuario
  usuarios: Usuario[]
}

export default function TablonNotas({ data, yo, usuarios }: Props) {
  const [notas, setNotas] = useState<Nota[]>([])
  const [texto, setTexto] = useState('')
  const [esAlerta, setEsAlerta] = useState(false)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    return data.onNotasChange(setNotas)
  }, [data])

  const nombrePorId = new Map(usuarios.map((u) => [u.id, u.nombre]))

  async function publicar() {
    if (!texto.trim() || enviando) return
    setEnviando(true)
    try {
      await data.crearNota({
        usuario_id: yo.id,
        texto: texto.trim(),
        es_alerta: esAlerta,
      })
      setTexto('')
      setEsAlerta(false)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void publicar()
        }}
        style={{ marginBottom: '1rem' }}
        data-testid="form-nota"
      >
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe una nota o alerta para la familia…"
          rows={2}
          data-testid="input-texto-nota"
          style={{ display: 'block', width: '100%', padding: '0.5rem', marginBottom: '0.5rem' }}
        />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginRight: '1rem' }}>
          <input
            type="checkbox"
            checked={esAlerta}
            onChange={(e) => setEsAlerta(e.target.checked)}
            data-testid="checkbox-alerta"
          />
          Marcar como alerta (envía push)
        </label>
        <button type="submit" disabled={enviando || !texto.trim()} data-testid="btn-publicar-nota">
          Publicar
        </button>
      </form>

      {notas.length === 0 ? (
        <p style={{ color: '#888' }} data-testid="notas-vacio">Aún no hay notas.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} data-testid="lista-notas">
          {notas.map((n) => {
            const autor = nombrePorId.get(n.usuario_id) ?? '?'
            return (
              <li
                key={n.id}
                data-testid={`nota-${n.id}`}
                style={{
                  border: '1px solid #30363d',
                  borderLeft: n.es_alerta ? '4px solid #f0883e' : '4px solid transparent',
                  background: n.es_alerta ? '#2a1f15' : '#161b22',
                  padding: '0.75rem',
                  borderRadius: 6,
                  marginBottom: '0.5rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 4,
                  }}
                >
                  <small style={{ color: '#888' }}>
                    {n.es_alerta && (
                      <span
                        style={{
                          background: '#f0883e',
                          color: '#000',
                          padding: '1px 6px',
                          borderRadius: 3,
                          marginRight: 6,
                          fontWeight: 600,
                        }}
                      >
                        ALERTA
                      </span>
                    )}
                    {autor} · {new Date(n.fecha_creacion).toLocaleString()}
                  </small>
                  <button
                    type="button"
                    onClick={() => void data.eliminarNota(n.id)}
                    style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                    title="Borrar nota"
                    data-testid={`btn-borrar-nota-${n.id}`}
                  >
                    ×
                  </button>
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{n.texto}</div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
