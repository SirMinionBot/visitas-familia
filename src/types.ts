// Tipos compartidos del modelo de datos (espejo de la spec del documento de requisitos).
// Mantener sincronizado con las reglas de Firestore en firestore.rules y con los
// documentos que crean las Cloud Functions en functions/src.

export type ISODateString = string

export interface Usuario {
  id: string
  nombre: string
  onesignal_player_ids: string[]
  fecha_creacion: ISODateString
}

export interface Turno {
  id: string
  usuario_ids: string[] // varios familiares pueden coincidir en el mismo turno
  fecha_inicio: ISODateString
  fecha_fin: ISODateString
  notas?: string
  creado_por: string
  fecha_creacion: ISODateString
}

export interface Nota {
  id: string
  usuario_id: string
  texto: string
  es_alerta: boolean
  fecha_creacion: ISODateString
}

// Identidad persistida en localStorage para no pedir nombre cada vez.
export const STORAGE_KEYS = {
  usuarioId: 'vf:usuarioId',
  onesignalPlayerId: 'vf:onesignalPlayerId',
} as const
