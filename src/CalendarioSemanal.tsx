import { useEffect, useMemo, useState } from 'react'
import type { DataLayer } from './data'
import type { Turno, Usuario } from './types'
import {
  DIAS_SEMANA,
  inicioSemana,
  sumarDias,
  toInputDateTimeLocal,
  fromInputDateTimeLocal,
  isoLocal,
  formatFechaCorta,
  franjasDelDia,
} from './fechas'

interface Props {
  data: DataLayer
  yo: Usuario
  usuarios: Usuario[]
}

export default function CalendarioSemanal({ data, yo, usuarios }: Props) {
  const [semanaInicio, setSemanaInicio] = useState<Date>(() => inicioSemana(new Date()))
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [editando, setEditando] = useState<Turno | null>(null)
  const [creando, setCreando] = useState<{ fecha_inicio: string; fecha_fin: string } | null>(null)

  useEffect(() => {
    const unsub = data.onTurnosChange(setTurnos)
    return unsub
  }, [data])

  const franjas = useMemo(() => franjasDelDia(), [])
  const mapaNombre = useMemo(() => {
    const m = new Map<string, string>()
    usuarios.forEach((u) => m.set(u.id, u.nombre))
    return m
  }, [usuarios])

  function abrirCreacion(dia: Date, hora: number, minutos: number) {
    const inicio = new Date(dia)
    inicio.setHours(hora, minutos, 0, 0)
    const fin = new Date(inicio)
    fin.setHours(fin.getHours() + 1)
    setCreando({
      fecha_inicio: toInputDateTimeLocal(inicio),
      fecha_fin: toInputDateTimeLocal(fin),
    })
    setEditando(null)
  }

  async function guardarNuevo(input: {
    usuario_ids: string[]
    fecha_inicio: string
    fecha_fin: string
    notas?: string
  }) {
    await data.crearTurno({
      ...input,
      creado_por: yo.id,
    })
    setCreando(null)
  }

  async function guardarEditado(id: string, patch: Partial<Turno>) {
    await data.actualizarTurno(id, patch)
    setEditando(null)
  }

  function turnosEnFranja(dia: Date, franjaInicio: Date, franjaFin: Date): Turno[] {
    const iniIso = isoLocal(franjaInicio)
    const finIso = isoLocal(franjaFin)
    return turnos.filter((t) => {
      const tInicio = new Date(t.fecha_inicio)
      if (tInicio.toDateString() !== dia.toDateString()) return false
      return t.fecha_inicio < finIso && iniIso < t.fecha_fin
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <button
          type="button"
          onClick={() => setSemanaInicio((s) => sumarDias(s, -7))}
        >
          ← Semana
        </button>
        <strong style={{ flex: 1, textAlign: 'center' }}>
          {formatFechaCorta(semanaInicio)} – {formatFechaCorta(sumarDias(semanaInicio, 6))}
        </strong>
        <button
          type="button"
          onClick={() => setSemanaInicio((s) => sumarDias(s, 7))}
        >
          Semana →
        </button>
        <button
          type="button"
          onClick={() => setSemanaInicio(inicioSemana(new Date()))}
          title="Volver a la semana actual"
        >
          Hoy
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '60px repeat(7, 1fr)',
          gap: '1px',
          background: '#30363d',
          border: '1px solid #30363d',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <div style={headerCell}>Hora</div>
        {DIAS_SEMANA.map((d, i) => (
          <div key={d} style={headerCell}>
            {d}
            <br />
            <small style={{ color: '#888' }}>
              {formatFechaCorta(sumarDias(semanaInicio, i))}
            </small>
          </div>
        ))}

        {franjas.map((franja, idxFila) => (
          <RowFranja
            key={idxFila}
            franja={franja}
            semanaInicio={semanaInicio}
            turnosEnFranja={turnosEnFranja}
            mapaNombre={mapaNombre}
            yo={yo}
            onClickVacio={(dia) => abrirCreacion(dia, franja.inicio.getHours(), franja.inicio.getMinutes())}
            onClickTurno={(t) => {
              setEditando(t)
              setCreando(null)
            }}
          />
        ))}
      </div>

      {(creando || editando) && (
        <ModalFormulario
          data={data}
          usuarios={usuarios}
          yo={yo}
          creando={creando}
          editando={editando}
          onCancelar={() => {
            setCreando(null)
            setEditando(null)
          }}
          onGuardarNuevo={guardarNuevo}
          onGuardarEditado={guardarEditado}
        />
      )}
    </div>
  )
}

function RowFranja({
  franja,
  semanaInicio,
  turnosEnFranja,
  mapaNombre,
  yo,
  onClickVacio,
  onClickTurno,
}: {
  franja: { inicio: Date; fin: Date; label: string }
  semanaInicio: Date
  turnosEnFranja: (dia: Date, fIni: Date, fFin: Date) => Turno[]
  mapaNombre: Map<string, string>
  yo: Usuario
  onClickVacio: (dia: Date) => void
  onClickTurno: (t: Turno) => void
}) {
  return (
    <>
      <div style={{ ...bodyCell, fontSize: '0.75rem', color: '#888' }}>{franja.label}</div>
      {Array.from({ length: 7 }).map((_, iDia) => {
        const dia = sumarDias(semanaInicio, iDia)
        const t = turnosEnFranja(dia, franja.inicio, franja.fin)
        return (
          <div
            key={iDia}
            onClick={() => {
              if (t.length === 0) onClickVacio(dia)
            }}
            style={{
              ...bodyCell,
              minHeight: 32,
              cursor: t.length === 0 ? 'pointer' : 'default',
            }}
          >
            {t.map((turno) => (
              <button
                key={turno.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onClickTurno(turno)
                }}
                title={`${new Date(turno.fecha_inicio).toLocaleString()} → ${new Date(
                  turno.fecha_fin,
                ).toLocaleString()}`}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '2px 4px',
                  marginBottom: 2,
                  fontSize: '0.7rem',
                  background: turno.usuario_ids.includes(yo.id) ? '#1f6feb' : '#238636',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 3,
                  textAlign: 'left',
                }}
              >
                {turno.usuario_ids
                  .map((id) => mapaNombre.get(id) ?? '?')
                  .join(', ')}
              </button>
            ))}
          </div>
        )
      })}
    </>
  )
}

function ModalFormulario({
  data,
  usuarios,
  yo,
  creando,
  editando,
  onCancelar,
  onGuardarNuevo,
  onGuardarEditado,
}: {
  data: DataLayer
  usuarios: Usuario[]
  yo: Usuario
  creando: { fecha_inicio: string; fecha_fin: string } | null
  editando: Turno | null
  onCancelar: () => void
  onGuardarNuevo: (input: {
    usuario_ids: string[]
    fecha_inicio: string
    fecha_fin: string
    notas?: string
  }) => Promise<void>
  onGuardarEditado: (id: string, patch: Partial<Turno>) => Promise<void>
}) {
  const [seleccionados, setSeleccionados] = useState<string[]>(editando ? editando.usuario_ids : [yo.id])
  const [inicio, setInicio] = useState<string>(
    editando ? toInputDateTimeLocal(new Date(editando.fecha_inicio)) : creando?.fecha_inicio ?? '',
  )
  const [fin, setFin] = useState<string>(
    editando ? toInputDateTimeLocal(new Date(editando.fecha_fin)) : creando?.fecha_fin ?? '',
  )
  const [notas, setNotas] = useState<string>(editando?.notas ?? '')

  function toggle(id: string) {
    setSeleccionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function guardar() {
    if (!inicio || !fin) return
    const notasTrim = notas.trim()
    const payload: {
      usuario_ids: string[]
      fecha_inicio: string
      fecha_fin: string
      creado_por: string
      notas?: string
    } = {
      usuario_ids: seleccionados,
      fecha_inicio: isoLocal(fromInputDateTimeLocal(inicio)),
      fecha_fin: isoLocal(fromInputDateTimeLocal(fin)),
      creado_por: editando?.creado_por ?? yo.id,
    }
    // Firestore rechaza undefined como valor de campo; solo añadimos notas si hay contenido.
    if (notasTrim) payload.notas = notasTrim
    if (editando) {
      await onGuardarEditado(editando.id, payload)
    } else {
      await onGuardarNuevo(payload)
    }
  }

  async function eliminar() {
    if (!editando) return
    await data.eliminarTurno(editando.id)
    onCancelar()
  }

  return (
    <div
      onClick={onCancelar}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '1rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 8,
          padding: '1.25rem',
          maxWidth: 480,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <h3 style={{ marginTop: 0 }}>{editando ? 'Editar turno' : 'Nuevo turno'}</h3>

        <fieldset style={{ border: 'none', padding: 0, marginBottom: '0.75rem' }}>
          <legend style={{ fontWeight: 600, marginBottom: 4 }}>Familiares</legend>
          {usuarios.map((u) => (
            <label key={u.id} style={{ display: 'block', margin: '0.25rem 0' }}>
              <input
                type="checkbox"
                checked={seleccionados.includes(u.id)}
                onChange={() => toggle(u.id)}
              />{' '}
              {u.nombre}
            </label>
          ))}
        </fieldset>

        <label style={{ display: 'block', marginBottom: '0.5rem' }}>
          Inicio
          <input
            type="datetime-local"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            style={{ display: 'block', width: '100%', padding: '0.4rem', marginTop: 2 }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: '0.5rem' }}>
          Fin
          <input
            type="datetime-local"
            value={fin}
            onChange={(e) => setFin(e.target.value)}
            style={{ display: 'block', width: '100%', padding: '0.4rem', marginTop: 2 }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          Notas (opcional)
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            style={{ display: 'block', width: '100%', padding: '0.4rem', marginTop: 2 }}
          />
        </label>

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between' }}>
          <div>
            {editando && (
              <button
                type="button"
                onClick={() => void eliminar()}
                style={{ background: '#da3633', borderColor: '#da3633' }}
              >
                Eliminar
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={onCancelar}>
              Cancelar
            </button>
            <button type="button" onClick={() => void guardar()}>
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const headerCell: React.CSSProperties = {
  background: '#161b22',
  padding: '0.5rem',
  textAlign: 'center',
  fontWeight: 600,
  fontSize: '0.85rem',
}

const bodyCell: React.CSSProperties = {
  background: '#0d1117',
  padding: '2px 4px',
  borderTop: '1px solid #30363d',
}
