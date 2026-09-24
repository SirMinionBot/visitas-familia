# Visitas Familia

PWA privada y familiar para coordinar turnos de visita a un paciente hospitalizado y compartir notas/alertas relevantes sobre su cuidado.

> **Privado.** Datos de salud familiar. El código se aloja en un repositorio privado, pero el sitio publicado en GitHub Pages es accesible por URL. La seguridad se apoya en no compartir el enlace fuera del núcleo familiar (ver [sección 4](#4-seguridad)).

## Stack

| Capa | Tecnología | Coste |
|---|---|---|
| Frontend (PWA) | Vite + React + TypeScript + `vite-plugin-pwa` | 0 € |
| Hosting | GitHub Pages | 0 € |
| Base de datos | Cloud Firestore (Spark plan) | 0 € |
| Notificaciones push | OneSignal (Web Push) | 0 € |
| Lógica de notificaciones | Firebase Cloud Functions | 0 € (cuota gratuita, requiere Blaze para desplegar) |

## Estado del proyecto

**Scaffold inicial.** Implementado:

- Estructura PWA instalable (manifest, service worker vía `vite-plugin-pwa`, iconos placeholder).
- Pantalla de selección/creación de usuario (sin auth, lista de nombres de Firestore).
- Persistencia de identidad en `localStorage`.
- Reglas de Firestore (`firestore.rules`) que limitan campos escribibles.
- Cloud Functions v2 (`functions/src/`) para OneSignal: push inmediato al crear/editar turnos y alertas, y recordatorio programado 30 min antes (cancelado/reprogramado al editar o borrar el turno). Listo para desplegar; ver [docs/ONESIGNAL.md](./docs/ONESIGNAL.md).
- Cliente OneSignal Web SDK v16 (`src/onesignal.ts`) con botón "Activar notificaciones".

Pendiente (siguientes iteraciones):

- Vista semanal del calendario y CRUD de turnos.
- Tablón de notas + distinción visual de alertas.
- Despliegue de las funciones: crear la app en OneSignal, secrets y `firebase deploy` (pasos exactos en [docs/ONESIGNAL.md](./docs/ONESIGNAL.md)).

Ver [ROADMAP.md](./ROADMAP.md) para el detalle.

## Estructura del repo

```
.
├── src/                    Frontend (React + TS)
│   ├── App.tsx             Shell principal
│   ├── SeleccionUsuario.tsx Identidad (sección 4 del doc de requisitos)
│   ├── firebase.ts         Cliente Firebase
│   ├── types.ts            Tipos compartidos del modelo de datos
│   └── main.tsx            Entrada + registro del service worker
├── public/                 Iconos PWA y assets estáticos
├── scripts/                Utilidades (generador de iconos placeholder)
├── functions/              Cloud Functions (listas, pendientes de desplegar)
│   └── src/index.ts        Disparadores de notificaciones vía OneSignal
├── docs/ONESIGNAL.md       Guía de puesta en marcha de las notificaciones push
├── firestore.rules         Reglas de seguridad de Firestore
├── .env.example            Plantilla de variables de entorno
├── vite.config.ts          Configuración Vite + PWA
└── ROADMAP.md              Pasos siguientes
```

## Desarrollo local

```bash
pnpm install
cp .env.example .env       # rellenar con credenciales de Firebase
pnpm dev                   # http://localhost:5173/visitas-familia/
pnpm build                 # genera dist/ para desplegar
```

## Notificaciones push (OneSignal)

Resumen; guía completa con IAM y comprobaciones en [docs/ONESIGNAL.md](./docs/ONESIGNAL.md).

1. Crear una app **Web Push (Custom Code)** en [onesignal.com](https://onesignal.com) con URL `https://sirminionbot.github.io/visitas-familia/`.
2. `gh secret set VITE_ONESIGNAL_APP_ID` (secret de GitHub, lo lee la build de la PWA).
3. `npm --prefix functions install`, luego `firebase functions:secrets:set ONESIGNAL_APP_ID` y `firebase functions:secrets:set ONESIGNAL_API_KEY` (la REST API key solo vive aquí).
4. `firebase deploy --only firestore:rules,functions` (requiere plan Blaze y permisos de despliegue, ver la guía).

## Modelo de datos (resumen)

- `usuarios/{uid}` — `{ nombre, onesignal_player_ids[], fecha_creacion }`
- `turnos/{tid}` — `{ usuario_ids[], fecha_inicio, fecha_fin, notas, creado_por, fecha_creacion }`
- `notas/{nid}` — `{ usuario_id, texto, es_alerta, fecha_creacion }`
- `recordatorios/{tid}` — solo Cloud Functions: id del recordatorio programado en OneSignal

Detalle completo en `firestore.rules` y `src/types.ts`.

## Seguridad

Sin autenticación por diseño (decisión del documento de requisitos, sección 9.3). El control de acceso se apoya en:

1. No compartir el enlace de la PWA fuera del núcleo familiar.
2. Las reglas de Firestore limitan los campos que un cliente puede escribir (no se puede inyectar contenido mal formado).
3. No hay datos indexados públicamente: solo quien conozca la URL puede acceder.

## Licencia

MIT. Ver [LICENSE](./LICENSE).
