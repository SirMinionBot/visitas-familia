// Cliente de Firebase. La configuración real se inyecta desde variables de entorno
// en build time (Vite las lee de .env / .env.production). Las claves públicas se
// exponen en el bundle por diseño del SDK web de Firebase; el control de acceso real
// vive en firestore.rules + Cloud Functions.

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
