// Cliente de Firebase. Solo se inicializa si hay config en variables de entorno.
// Cuando falta, getDb() lanza un error claro y la capa de datos cae al modo mock
// (ver src/data.ts → getDataLayer).

import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

export const firebaseConfigured = !!firebaseConfig.projectId

let app: FirebaseApp | null = null
let db: Firestore | null = null

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    if (!firebaseConfig.projectId) {
      throw new Error(
        'Firebase no está configurado. Define VITE_FIREBASE_* en .env (ver .env.example).',
      )
    }
    app = initializeApp(firebaseConfig as Required<typeof firebaseConfig>)
  }
  return app
}

export function getDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp())
  }
  return db
}
