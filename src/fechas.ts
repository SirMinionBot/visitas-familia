// Utilidades de fecha para el calendario semanal (lunes como primer día).
// Mantenemos todo en hora local del dispositivo; las ISO strings se generan con
// el offset local para que el recordatorio programado de OneSignal llegue a la
// hora que el usuario espera en su reloj.

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const
export const DIAS_SEMANA = DIAS

export function inicioSemana(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  // JS: 0=Dom, 1=Lun. Queremos lunes como día 0.
  const dow = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - dow)
  return x
}

export function sumarDias(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function toInputDateTimeLocal(d: Date): string {
  // Formato que espera <input type="datetime-local">: YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

export function fromInputDateTimeLocal(s: string): Date {
  return new Date(s)
}

export function isoLocal(d: Date): string {
  // Para guardar en Firestore (que se envía a Cloud Functions como string).
  return d.toISOString()
}

export function formatHora(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function formatFechaCorta(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`
}

export function solapan(aInicio: string, aFin: string, bInicio: string, bFin: string): boolean {
  return aInicio < bFin && bInicio < aFin
}

export function franjasDelDia(): { inicio: Date; fin: Date; label: string }[] {
  // Las 24 h del día (00:00 a 24:00) en tramos de 30 min.
  const out: { inicio: Date; fin: Date; label: string }[] = []
  const ref = new Date()
  ref.setHours(0, 0, 0, 0)
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      const inicio = new Date(ref)
      inicio.setHours(h, m, 0, 0)
      const fin = new Date(inicio)
      fin.setMinutes(fin.getMinutes() + 30)
      out.push({ inicio, fin, label: formatHora(inicio) })
    }
  }
  return out
}
