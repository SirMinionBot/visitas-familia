# Notificaciones push con OneSignal: puesta en marcha

Todo el código ya está escrito (cliente en `src/onesignal.ts`, Cloud Functions en `functions/`). Solo faltan los pasos de cuenta y despliegue de esta guía. Proyecto Firebase: `familia-ed378` (Firestore en `eur3`, funciones en `europe-west1`).

## Cómo funciona

1. Cada familiar abre la PWA, elige su nombre y pulsa **Activar notificaciones** (el botón solo aparece si la build tiene `VITE_ONESIGNAL_APP_ID`). El id de suscripción push del dispositivo se guarda en `usuarios/{uid}.onesignal_player_ids`.
2. Cloud Functions (v2, disparadas por Firestore):
   - `turnosWritten` (`turnos/{tid}`):
     - Alta: push a todos menos a quien creó el turno, y recordatorio programado 30 min antes del inicio para los participantes.
     - Edición de horario o participantes: push "Turno modificado" a los afectados (antiguos y nuevos participantes) y el recordatorio anterior se cancela y se reprograma. Editar solo `notas` no notifica.
     - Borrado: se cancela el recordatorio pendiente.
   - `notasCreated` (`notas/{nid}`): si `es_alerta` es `true`, push a todos menos al autor.
3. El id del recordatorio programado se guarda en `recordatorios/{tid}` (colección solo accesible por las funciones; las reglas la bloquean a los clientes).

Limitaciones conocidas:

- Sin autenticación no se sabe quién edita un turno, por eso en las ediciones el editor también puede recibir el aviso.
- Si dos personas comparten un mismo dispositivo y usan "Cambiar de usuario", el dispositivo queda vinculado a ambas.
- Las funciones no reintentan el evento: si OneSignal falla, el error queda en los logs. Cada envío lleva un `idempotency_key` derivado del id del evento, así que una reentrega no duplica avisos.
- Si dos ediciones del mismo turno se procesan exactamente a la vez, podría quedar un recordatorio duplicado o huérfano (caso muy raro en uso familiar).
- Las reglas limitan `onesignal_player_ids` a 10 ids por usuario. Si alguien reinstala la app muchas veces, hay que limpiar la lista a mano en la consola.
- iPhone/iPad: solo funciona con iOS 16.4 o superior y con la PWA **añadida a la pantalla de inicio** (Compartir, "Añadir a pantalla de inicio"). En Safari normal no aparece el permiso.

## 1. Crear la app en OneSignal

1. Crea cuenta en [onesignal.com](https://onesignal.com) y pulsa **New App/Website**. Nombre: `Visitas Familia`.
2. Plataforma: **Web** (Web Push).
3. Configuración: elige **Custom Code** (no "Typical Site", que instalaría su propio service worker en la raíz y chocaría con el de la PWA).
4. **Site URL**: `https://sirminionbot.github.io/visitas-familia/`. Verifica en el asistente si el campo acepta la ruta completa; si solo admite el origen (`https://sirminionbot.github.io`), déjalo así: el código ya fija por su cuenta el service worker y su scope bajo `/visitas-familia/push/onesignal/`, no depende de ese campo.
5. Activa **Auto Resubscribe** y, si aparece, deja desactivados los avisos de "prompt" automáticos: la app pide el permiso con su propio botón.
6. Ve a **Settings, Keys & IDs** y anota:
   - **OneSignal App ID** (un UUID). No es secreto.
   - **App API Key** (REST API key, formato nuevo `os_v2_app_...`). **Es secreta**: nunca en el repositorio ni en el cliente. Si solo ves la clave antigua, genera una nueva.

## 2. Dónde va cada valor

| Valor | Dónde | Para qué |
|---|---|---|
| `VITE_ONESIGNAL_APP_ID` | Secret del repositorio de GitHub (Settings, Secrets and variables, Actions) y, para pruebas locales, `.env` | Lo lee la build de la PWA. Ya está referenciado en `.github/workflows/deploy.yml`. |
| `ONESIGNAL_APP_ID` | Secret de Firebase Functions | Las funciones lo usan al llamar a la REST API. |
| `ONESIGNAL_API_KEY` | Secret de Firebase Functions | Idem. Nunca va al cliente ni a GitHub. |

Configurar el App ID en GitHub:

```bash
gh secret set VITE_ONESIGNAL_APP_ID   # pega el App ID cuando lo pida
```

Después lanza el workflow "Deploy to GitHub Pages" (push a `main` o botón "Run workflow") para que la web se recompile con el App ID.

## 3. Requisitos de Google Cloud / Firebase

- **Plan Blaze** obligatorio para desplegar Cloud Functions (Firebase Console, Uso y facturación). El uso familiar cabe de sobra en la cuota gratuita; conviene poner un presupuesto con alerta (p. ej. 1 EUR).
- La primera vez, el despliegue activa por sí solo estas APIs si quien despliega puede hacerlo: Cloud Functions, Cloud Build, Artifact Registry, Cloud Run, Eventarc, Pub/Sub y Secret Manager.

### Permisos de quien despliega

Lo más simple: que la cuenta de Google que hace `firebase login` sea **Propietario (Owner)** del proyecto `familia-ed378`; con eso no hace falta nada más. Si no es Owner, necesita como mínimo estos roles en el proyecto (IAM y administración, Conceder acceso):

| Rol | Motivo |
|---|---|
| Cloud Functions Admin (`roles/cloudfunctions.admin`) | Crear y actualizar funciones |
| Cloud Run Admin (`roles/run.admin`) | Las funciones v2 son servicios de Cloud Run |
| Service Account User (`roles/iam.serviceAccountUser`) | Poder "actuar como" la cuenta de servicio de ejecución (error típico: `iam.serviceAccounts.ActAs`) |
| Artifact Registry Administrator (`roles/artifactregistry.admin`) | Guardar la imagen de contenedor de la función |
| Cloud Build Editor (`roles/cloudbuild.builds.editor`) | Lanzar la compilación |
| Secret Manager Admin (`roles/secretmanager.admin`) | `functions:secrets:set` y dar acceso a la función |
| Eventarc Admin (`roles/eventarc.admin`) | Crear los triggers de Firestore |
| Service Usage Admin (`roles/serviceusage.serviceUsageAdmin`) | Activar las APIs anteriores |
| Firebase Rules Admin y Cloud Datastore Viewer (o Firebase Admin) | Desplegar `firestore.rules` y leer la ubicación de la base (necesario para el trigger en `eur3`) |

### Cuentas de servicio (errores típicos del primer despliegue)

- **Cuenta de Cloud Build / cuenta de cómputo por defecto.** En proyectos nuevos, la compilación falla con `Build failed ... does not have permission` si la cuenta de servicio de Compute no tiene rol de build. Solución (sustituye el número de proyecto):

  ```bash
  PROJECT=familia-ed378
  NUM=$(gcloud projects describe $PROJECT --format='value(projectNumber)')
  gcloud projects add-iam-policy-binding $PROJECT \
    --member="serviceAccount:$NUM-compute@developer.gserviceaccount.com" \
    --role="roles/cloudbuild.builds.builder"
  ```

- **Eventarc.** Si el primer despliegue termina con `Permission denied while using the Eventarc Service Agent`, espera unos minutos (los permisos tardan en propagarse) y repite el despliegue. La CLI se encarga de conceder `eventarc.eventReceiver`, `run.invoker` y `iam.serviceAccountTokenCreator` a las cuentas de servicio implicadas si quien despliega puede administrar IAM.
- **Política de limpieza de imágenes.** La CLI puede preguntar cuántos días conservar las imágenes de contenedor en Artifact Registry: contesta `1` (evita cobros por almacenamiento).

## 4. Despliegue

Desde la raíz del repositorio:

```bash
npm install -g firebase-tools        # o: pnpm dlx firebase-tools ...
firebase login

# Dependencias de las funciones (el predeploy ejecuta `tsc` y las necesita)
npm --prefix functions install

# Secretos (se piden por consola con la entrada oculta)
firebase functions:secrets:set ONESIGNAL_APP_ID
firebase functions:secrets:set ONESIGNAL_API_KEY

# Reglas (incluye el bloqueo de `recordatorios`) y funciones
firebase deploy --only firestore:rules,functions
```

El proyecto por defecto (`familia-ed378`) sale de `.firebaserc`. Si cambias un secreto más adelante, vuelve a ejecutar `functions:secrets:set` y `firebase deploy --only functions`, porque las funciones leen el valor al desplegarse.

## 5. Comprobación

1. Abre la PWA publicada (en iPhone, primero instálala en la pantalla de inicio), elige tu usuario y pulsa **Activar notificaciones**. Acepta el permiso.
2. En DevTools, Application, Service Workers, deben aparecer dos: el de la PWA (`/visitas-familia/`) y el de OneSignal (`/visitas-familia/push/onesignal/`).
3. En Firestore, `usuarios/{tu id}` debe tener un valor en `onesignal_player_ids`.
4. Desde otro usuario/dispositivo, crea una nota con "alerta": debe llegar el push. En OneSignal, Delivery, Sent Messages, se ve el envío.
5. Crea un turno que empiece dentro de más de 30 minutos: en OneSignal aparece un mensaje **Scheduled**; si editas la hora o borras el turno, el programado anterior desaparece.
6. Logs de las funciones: `firebase functions:log --only turnosWritten,notasCreated` (los fallos de OneSignal se registran como error; la API key nunca se imprime).

Si algo no llega: revisa que los dos secrets existan (`firebase functions:secrets:get ONESIGNAL_API_KEY` muestra solo sus metadatos, nunca el valor), que la app haya recibido el permiso y que `onesignal_player_ids` no esté vacío.

## Desarrollo local

Sin `VITE_ONESIGNAL_APP_ID` la integración queda desactivada: no se carga el SDK ni se muestra el botón. Para probar en local, añade el App ID a `.env`; `allowLocalhostAsSecureOrigin` está activo, pero el sitio de OneSignal debe tener habilitado el testing en localhost (Settings, Web configuration).
