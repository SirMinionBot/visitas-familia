import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
  formatHora,
  franjasDelDia,
} from './fechas'

interface Props {
  data: DataLayer
  yo: Usuario
  usuarios: Usuario[]
}

type Vista = 'semana' | 'dia'

const MQ_MOVIL = '(max-width: 640px)'
// Hora a la que se posiciona el scroll al abrir el calendario (si hoy no está a la vista).
const HORA_INICIAL = 8

function useEsMovil(): boolean {
  const [movil, setMovil] = useState(() => window.matchMedia(MQ_MOVIL).matches)
  useEffect(() => {
    const mq = window.matchMedia(MQ_MOVIL)
    const onChange = () => setMovil(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return movil
}

function nombreDia(d: Date): string {
  return DIAS_SEMANA[(d.getDay() + 6) % 7]
}

function claveHora(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`
}

function claveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function CalendarioSemanal({ data, yo, usuarios }: Props) {
  const esMovil = useEsMovil()
  // Fecha "ancla": cualquier día de lo que se está viendo. La semana se deriva de ella.
  const [ancla, setAncla] = useState<Date>(() => new Date())
  // null = automático (día en móvil, semana en pantallas grandes).
  const [vistaManual, setVistaManual] = useState<Vista | null>(null)
  const vista: Vista = vistaManual ?? (esMovil ? 'dia' : 'semana')
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [editando, setEditando] = useState<Turno | null>(null)
  const [creando, setCreando] = useState<{ fecha_inicio: string; fecha_fin: string } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub = data.onTurnosChange(setTurnos)
    return unsub
  }, [data])

  const semanaInicio = useMemo(() => inicioSemana(ancla), [ancla])
  const diasSemana = useMemo(() => Array.from({ length: 7 }, (_, i) => sumarDias(semanaInicio, i)), [semanaInicio])
  const diasVisibles = vista === 'semana' ? diasSemana : [ancla]
  const franjas = useMemo(() => franjasDelDia(), [])
  const mapaNombre = useMemo(() => {
    const m = new Map<string, string>()
    usuarios.forEach((u) => m.set(u.id, u.nombre))
    return m
  }, [usuarios])

  // Al cambiar de vista o de semana/día, colocamos el scroll: en la hora actual si
  // hoy está a la vista, y si no a primera hora de la mañana. Así no se empieza a las 00:00.
  useLayoutEffect(() => {
    const cont = scrollRef.current
    if (!cont) return
    const hoy = new Date()
    const hoyVisible = diasVisibles.some((d) => d.toDateString() === hoy.toDateString())
    const hora = hoyVisible ? Math.max(hoy.getHours() - 1, 0) : HORA_INICIAL
    const fila = cont.querySelector<HTMLElement>(`[data-testid="hora-${String(hora).padStart(2, '0')}00"]`)
    const cabecera = cont.querySelector<HTMLElement>('[data-testid="cal-cabecera"]')
    if (!fila) return
    cont.scrollTop +=
      fila.getBoundingClientRect().top - cont.getBoundingClientRect().top - (cabecera?.offsetHeight ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, semanaInicio.getTime(), vista === 'dia' ? ancla.toDateString() : ''])

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

  // Instantes [ini, fin) de una franja trasladada al día de la celda.
  // franjasDelDia() genera las franjas sobre la fecha de hoy, así que hay que
  // reubicarlas; la última franja (23:30–24:00) acaba en el día siguiente.
  function limitesFranja(dia: Date, franjaInicio: Date, franjaFin: Date): [number, number] {
    const ini = new Date(dia)
    ini.setHours(franjaInicio.getHours(), franjaInicio.getMinutes(), 0, 0)
    const fin = new Date(dia)
    fin.setHours(franjaFin.getHours(), franjaFin.getMinutes(), 0, 0)
    if (fin <= ini) fin.setDate(fin.getDate() + 1)
    return [ini.getTime(), fin.getTime()]
  }

  function turnosEnFranja(dia: Date, franjaInicio: Date, franjaFin: Date): Turno[] {
    const [iniMs, finMs] = limitesFranja(dia, franjaInicio, franjaFin)
    return turnos.filter((t) => {
      if (!t.fecha_inicio || !t.fecha_fin) return false
      const tIni = new Date(t.fecha_inicio).getTime()
      const tFin = new Date(t.fecha_fin).getTime()
      return tIni < finMs && iniMs < tFin
    })
  }

  function diaTieneTurnos(dia: Date): boolean {
    const ini = new Date(dia)
    ini.setHours(0, 0, 0, 0)
    const iniMs = ini.getTime()
    const finMs = sumarDias(ini, 1).getTime()
    return turnos.some((t) => {
      const tIni = new Date(t.fecha_inicio).getTime()
      const tFin = new Date(t.fecha_fin).getTime()
      return tIni < finMs && iniMs < tFin
    })
  }

  const paso = vista === 'semana' ? 7 : 1
  const pref = vista === 'semana' ? 'semana' : 'dia'
  const etiqueta =
    vista === 'semana'
      ? `${formatFechaCorta(semanaInicio)} – ${formatFechaCorta(sumarDias(semanaInicio, 6))}`
      : `${nombreDia(ancla)} ${formatFechaCorta(ancla)}`

  return (
    <div>
      <div className="cal-nav" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <button
          type="button"
          onClick={() => setAncla((a) => sumarDias(a, -paso))}
          data-testid={`${pref}-anterior`}
          aria-label={vista === 'semana' ? 'Semana anterior' : 'Día anterior'}
        >
          ←{vista === 'semana' && !esMovil ? ' Semana' : ''}
        </button>
        <strong style={{ flex: 1, textAlign: 'center' }} data-testid="semana-label">
          {etiqueta}
        </strong>
        <button
          type="button"
          onClick={() => setAncla((a) => sumarDias(a, paso))}
          data-testid={`${pref}-siguiente`}
          aria-label={vista === 'semana' ? 'Semana siguiente' : 'Día siguiente'}
        >
          {vista === 'semana' && !esMovil ? 'Semana ' : ''}→
        </button>
        <button
          type="button"
          onClick={() => setAncla(new Date())}
          data-testid="semana-hoy"
          title="Volver a hoy"
        >
          Hoy
        </button>
      </div>

      <div className="cal-nav" style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
        <div role="group" aria-label="Tipo de vista" style={{ display: 'flex', gap: 2 }}>
          {(['dia', 'semana'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVistaManual(v)}
              aria-pressed={vista === v}
              data-testid={`vista-${v}`}
              style={{ background: vista === v ? '#1f6feb' : undefined, borderColor: vista === v ? '#1f6feb' : undefined }}
            >
              {v === 'dia' ? 'Día' : 'Semana'}
            </button>
          ))}
        </div>
        {vista === 'dia' && (
          <div
            data-testid="tira-dias"
            style={{ display: 'flex', gap: 2, flex: 1, minWidth: 0 }}
          >
            {diasSemana.map((d) => {
              const activo = d.toDateString() === ancla.toDateString()
              return (
                <button
                  key={d.getTime()}
                  type="button"
                  onClick={() => setAncla(d)}
                  aria-pressed={activo}
                  aria-label={`${nombreDia(d)} ${formatFechaCorta(d)}`}
                  data-testid={`dia-${claveDia(d)}`}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '2px 0',
                    fontSize: '0.7rem',
                    lineHeight: 1.2,
                    background: activo ? '#1f6feb' : undefined,
                    borderColor: activo ? '#1f6feb' : undefined,
                  }}
                >
                  {nombreDia(d)}
                  <br />
                  <strong>{d.getDate()}</strong>
                  <br />
                  <span style={{ color: diaTieneTurnos(d) ? '#3fb950' : 'transparent' }} aria-hidden>
                    ●
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        data-testid="cal-scroll"
        style={{
          maxHeight: esMovil ? 'calc(100dvh - 15rem)' : 'calc(100dvh - 14rem)',
          minHeight: 240,
          overflow: 'auto',
          border: '1px solid #30363d',
          borderRadius: 6,
          overscrollBehavior: 'contain',
        }}
      >
        <div
          data-testid={`cal-grid-${vista}`}
          style={{
            display: 'grid',
            gridTemplateColumns: `${esMovil ? 48 : 60}px repeat(${diasVisibles.length}, minmax(${
              vista === 'semana' ? 64 : 0
            }px, 1fr))`,
            gap: '1px',
            background: '#30363d',
          }}
        >
          <div
            data-testid="cal-cabecera"
            style={{ ...headerCell, position: 'sticky', top: 0, left: 0, zIndex: 3 }}
          >
            Hora
          </div>
          {diasVisibles.map((d) => (
            <div key={d.getTime()} style={{ ...headerCell, position: 'sticky', top: 0, zIndex: 2 }}>
              {nombreDia(d)}
              <br />
              <small style={{ color: '#888' }}>{formatFechaCorta(d)}</small>
            </div>
          ))}

          {franjas.map((franja, idxFila) => (
            <RowFranja
              key={idxFila}
              franja={franja}
              dias={diasVisibles}
              turnosEnFranja={turnosEnFranja}
              mapaNombre={mapaNombre}
              yo={yo}
              movil={esMovil}
              onClickVacio={(dia) => abrirCreacion(dia, franja.inicio.getHours(), franja.inicio.getMinutes())}
              onClickTurno={(t) => {
                setEditando(t)
                setCreando(null)
              }}
            />
          ))}
        </div>
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
  dias,
  turnosEnFranja,
  mapaNombre,
  yo,
  movil,
  onClickVacio,
  onClickTurno,
}: {
  franja: { inicio: Date; fin: Date; label: string }
  dias: Date[]
  turnosEnFranja: (dia: Date, fIni: Date, fFin: Date) => Turno[]
  mapaNombre: Map<string, string>
  yo: Usuario
  movil: boolean
  onClickVacio: (dia: Date) => void
  onClickTurno: (t: Turno) => void
}) {
  const hhmm = claveHora(franja.inicio)
  // Las horas en punto llevan la etiqueta; las medias, más discretas.
  const enPunto = franja.inicio.getMinutes() === 0
  return (
    <>
      <div
        data-testid={`hora-${hhmm}`}
        style={{
          ...bodyCell,
          position: 'sticky',
          left: 0,
          zIndex: 1,
          fontSize: '0.75rem',
          color: enPunto ? '#aaa' : '#666',
          minHeight: movil ? 44 : 32,
        }}
      >
        {franja.label}
      </div>
      {dias.map((dia) => {
        const t = turnosEnFranja(dia, franja.inicio, franja.fin)
        return (
          <div
            key={dia.getTime()}
            onClick={() => {
              if (t.length === 0) onClickVacio(dia)
            }}
            data-testid={`celda-${claveDia(dia)}-${hhmm}`}
            style={{
              ...bodyCell,
              minHeight: movil ? 44 : 32,
              minWidth: 0,
              cursor: t.length === 0 ? 'pointer' : 'default',
              borderTop: enPunto ? '1px solid #30363d' : '1px dashed #21262d',
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
                data-testid={`turno-${turno.id}`}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: movil ? '6px 8px' : '2px 4px',
                  marginBottom: 2,
                  fontSize: movil ? '0.85rem' : '0.7rem',
                  background: turno.usuario_ids.includes(yo.id) ? '#1f6feb' : '#238636',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 3,
                  textAlign: 'left',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {turno.usuario_ids
                  .map((id) => mapaNombre.get(id) ?? '?')
                  .join(', ')}
                {dias.length === 1 && (
                  <small style={{ opacity: 0.8 }}>
                    {' · '}
                    {formatHora(new Date(turno.fecha_inicio))}–{formatHora(new Date(turno.fecha_fin))}
                  </small>
                )}
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
      data-testid="modal-backdrop"
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
        data-testid="modal"
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
            <label key={u.id} style={{ display: 'block', margin: '0.25rem 0' }} data-testid={`modal-usuario-${u.id}`}>
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
            data-testid="modal-inicio"
            style={{ display: 'block', width: '100%', padding: '0.4rem', marginTop: 2 }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: '0.5rem' }}>
          Fin
          <input
            type="datetime-local"
            value={fin}
            onChange={(e) => setFin(e.target.value)}
            data-testid="modal-fin"
            style={{ display: 'block', width: '100%', padding: '0.4rem', marginTop: 2 }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: '0.75rem' }}>
          Notas (opcional)
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            data-testid="modal-notas"
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
                data-testid="modal-eliminar"
                style={{ background: '#da3633', borderColor: '#da3633' }}
              >
                Eliminar
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={onCancelar} data-testid="modal-cancelar">
              Cancelar
            </button>
            <button type="button" onClick={() => void guardar()} data-testid="modal-guardar">
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
