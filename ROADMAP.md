# Roadmap

Próximos pasos en orden recomendado. Cada uno se aborda en una rama propia para mantener `main` siempre desplegable.

## 1. Configurar proyecto Firebase

- Crear proyecto en [Firebase Console](https://console.firebase.google.com/).
- Activar Firestore (modo nativo).
- Vincular cuenta de facturación Blaze (necesario para desplegar Cloud Functions, pero el uso familiar está muy por debajo del cuota gratuita).
- Rellenar `.env` con las credenciales (copiar de Project settings → General → Your apps → Web app).

## 2. Desplegar reglas de Firestore

```bash
pnpm dlx firebase-tools firestore:rules:deploy
```

(o desde la consola, pegar el contenido de `firestore.rules`).

## 3. OneSignal

- Crear cuenta y app Web Push en [onesignal.com](https://onesignal.com).
- Copiar `ONESIGNAL_APP_ID` y `ONESIGNAL_API_KEY` a Firebase Secrets:

```bash
firebase functions:secrets:set ONESIGNAL_APP_ID
firebase functions:secrets:set ONESIGNAL_API_KEY
```

- Inicializar OneSignal en el cliente (en `index.html` o `src/main.tsx` siguiendo su guía Web SDK).

## 4. Calendario semanal (vista principal)

- Crear componente `CalendarioSemanal.tsx` con grid 7×N (lun-dom × franjas horarias).
- Suscripción en tiempo real a `turnos` de Firestore.
- Formulario para crear turno (selector múltiple de usuarios + datetime + notas).
- Acciones de editar/borrar con confirmación.

## 5. Tablón de notas

- Lista cronológica inversa de `notas`.
- Distinción visual de `es_alerta: true` (icono + color).
- Formulario para crear nota con toggle de "marcar como alerta".

## 6. Despliegue en GitHub Pages

- Settings → Pages → Source: "GitHub Actions".
- Crear workflow `.github/workflows/deploy.yml` con:
  - `pnpm install --frozen-lockfile`
  - `pnpm build`
  - `actions/deploy-pages@v4` con `pnpm build` output.

## 7. Pruebas en dispositivos reales

- iOS Safari: abrir la URL,Compartir → Añadir a pantalla de inicio. Las notificaciones push solo funcionan tras añadir a pantalla de inicio (limitación de Apple).
- Android Chrome: instalar como PWA desde el banner.
- Validar notificaciones con un turno que comience en ~5 minutos.
