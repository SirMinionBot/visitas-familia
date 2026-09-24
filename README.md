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
- Stub de Cloud Functions (`functions/src/index.ts`) para OneSignal: notificaciones inmediatas + programadas (`send_after`).

Pendiente (siguientes iteraciones):

- Vista semanal del calendario y CRUD de turnos.
- Tablón de notas + distinción visual de alertas.
- Integración real de OneSignal Web SDK en el cliente.
- Despliegue: configurar proyecto Firebase, secrets de OneSignal, GitHub Pages con base path correcto.

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
├── functions/              Cloud Functions (stub, no desplegado todavía)
│   └── src/index.ts        Disparadores de notificaciones vía OneSignal
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

## Modelo de datos (resumen)

- `usuarios/{uid}` — `{ nombre, onesignal_player_ids[], fecha_creacion }`
- `turnos/{tid}` — `{ usuario_ids[], fecha_inicio, fecha_fin, notas, creado_por, fecha_creacion }`
- `notas/{nid}` — `{ usuario_id, texto, es_alerta, fecha_creacion }`

Detalle completo en `firestore.rules` y `src/types.ts`.

## Seguridad

Sin autenticación por diseño (decisión del documento de requisitos, sección 9.3). El control de acceso se apoya en:

1. No compartir el enlace de la PWA fuera del núcleo familiar.
2. Las reglas de Firestore limitan los campos que un cliente puede escribir (no se puede inyectar contenido mal formado).
3. No hay datos indexados públicamente: solo quien conozca la URL puede acceder.

## Licencia

MIT. Ver [LICENSE](./LICENSE).
