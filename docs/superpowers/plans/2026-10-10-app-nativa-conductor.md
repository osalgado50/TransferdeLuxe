# TVL Conductor (app nativa) · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** App Expo «TVL Conductor» (Android/iOS) con GPS en segundo plano, push de servicio nuevo y el flujo completo
del conductor, contra el mismo Supabase; distribución por TestFlight y prueba interna de Google Play.

**Spec:** `docs/superpowers/specs/2026-10-10-app-nativa-conductor-design.md`

**Tech Stack:** Expo SDK (última estable) + Expo Router + TypeScript · `@supabase/supabase-js` + AsyncStorage ·
`expo-location` + `expo-task-manager` · `expo-notifications` · `@maplibre/maplibre-react-native` con teselas
OpenStreetMap (sin claves de Google) · `expo-image-picker` · EAS Build/Submit (cuenta Expo `osalgado`).

## Global Constraints
- Sin APIs de pago ni claves de Google Maps (MapLibre + OSM; rutas con `/api/ruta` de la web).
- La app solo usa `NEXT_PUBLIC_SUPABASE_URL` y la clave anónima (vía `EXPO_PUBLIC_*`); nunca la service role.
- Toda acción de servicio pasa por `POST https://app.transfersvipluxe.com/api/conductor/accion` (misma lógica
  `ejecutarAccion`, idempotente por `idAccion`).
- Lógica pura compartida desde `src/lib/dominio/*` (no duplicar).
- Datos solo ficticios; textos en español; marca TVL (icono VIP LUXE, azul de marca).
- PROHIBIDO `npm run seed`, `npm run test:e2e`, `/api/demo/reset` (BD compartida con datos reales del responsable).
- Contraseñas de Apple/Google/Expo solo las teclea el humano en su terminal; nunca en el chat ni en ficheros.
- Commits pequeños en `main`, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. GPS en segundo plano: la tarea sigue enviando con pantalla bloqueada; se para al «Fuera de servicio» y al cerrar sesión.
2. Token caducado en segundo plano (la tarea de ubicación debe refrescar la sesión antes de insertar).
3. Acciones offline: cola persistente, idempotencia, reversión si el servidor rechaza.
4. Permisos denegados (ubicación «Siempre», notificaciones): avisos claros, sin bucles.
5. Push: token registrado por conductor; al reasignar, el anterior deja de recibir.

---

### Task N1: Andamiaje Expo, identidad y login
- `movil/` con `npx create-expo-app@latest movil --template tabs` (TypeScript, Expo Router).
- `app.config.ts`: nombre «TVL Conductor», slug `tvl-conductor`, owner `osalgado`, `ios.bundleIdentifier` y
  `android.package` `com.transfersvipluxe.conductor`, icono y splash desde `public/marca/` (generar 1024×1024 con sharp
  desde el icono VIP LUXE), `userInterfaceStyle: dark`, permisos de ubicación (textos en español) y `UIBackgroundModes`
  `location`, `remote-notification`; Android `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE_LOCATION`.
- `eas.json` con perfiles `development`, `preview` (Android APK, `distribution: internal`) y `production`
  (AAB / iOS store).
- `eas init --non-interactive` para crear el proyecto en la cuenta `osalgado` y guardar `projectId`.
- Metro/tsconfig para importar `../src/lib/dominio/*`.
- `lib/supabase.ts` (AsyncStorage, autoRefreshToken), pantalla Login (Email, Contraseña con ojo, Entrar, cuentas demo
  con Copiar/Usar como en la web), guardia de rol conductor (leer `perfiles`), cerrar sesión.
- Verificar: `npx tsc --noEmit` en `movil/`, `npx expo export --platform android` sin errores, `npx expo-doctor`.

### Task N2: Backend para la app (en la web)
- `POST /api/conductor/accion` (Bearer JWT → `getUser`, rol conductor, zod del cuerpo, `ejecutarAccion` con
  `repoSupabase(clienteAdmin())`), `force-dynamic`, tests unitarios (401, 403, 400, ok, duplicada).
- Migración `0008_dispositivos_push.sql`: tabla `dispositivos_push (conductor_id, token unique, plataforma, actualizado_en)`,
  RLS: el conductor inserta/actualiza/borra los suyos; operador lee. `POST /api/conductor/push-token` (Bearer) upsert.
- Envío push: en `src/lib/push.ts` función `notificarServicioNuevo(servicioId)` que llama a
  `https://exp.host/--/api/v2/push/send` con los tokens del conductor asignado; invocarla tras `asignar`/`reasignar`
  correctos (central y hoja de ruta). Fallos de push nunca rompen la asignación. Tests con fetch simulado.

### Task N3: Pantallas del conductor
- Hoy + Próximos (Realtime con setAuth como en la web), Servicio nuevo (modal a pantalla completa, cuenta atrás,
  ACEPTAR / Rechazar con motivos, «Ver más tarde», reconciliación periódica), Servicio en curso (botón de paso,
  Google Maps/Waze/llamar), Historial. Cola offline persistente (portar `src/lib/offline/cola.ts`) con envío a
  `/api/conductor/accion`.

### Task N4: GPS en segundo plano
- `expo-task-manager` + `Location.startLocationUpdatesAsync` (accuracy Balanced/High, `timeInterval` 15 s,
  `distanceInterval` 25 m, `foregroundService` con notificación «TVL Conductor está usando tu ubicación»,
  `showsBackgroundLocationIndicator`, `pausesUpdatesAutomatically: false`).
- La tarea inserta en `posiciones` con la sesión persistida (refrescar si caduca), con cola si no hay red.
- Interruptor En servicio (arranca/para la tarea, marca fuera de servicio), estado «📍 hace Xs», permisos
  «Mientras se usa» → «Siempre» con explicación. Cerrar sesión para la tarea.

### Task N5: Mapa y avisos
- MapLibre con estilo OSM raster, posición, objetivo, ruta de `/api/ruta` (Bearer), banner distancia/tiempo,
  avisos 500/100 m (vibración + notificación local), resaltado del botón, evento «llegando» vía `/api/conductor/accion`
  o ruta propia equivalente a `avisarLlegando`.

### Task N6: Ticket
- Cámara / galería, subida al bucket `tickets/<conductorId>/…` con la sesión del conductor (política de Storage de
  inserción propia si falta → migración), formulario manual con validación (`esquemaTicket` compartido) y guardado
  vía nueva ruta `POST /api/conductor/ticket` (Bearer) que reutiliza la lógica de `guardarTicket`.

### Task N7: Compilaciones y distribución (con el humano)
- Android: `eas build -p android --profile preview` → APK de instalación directa; después `production` (AAB) y
  `eas submit` a la pista de prueba interna (requiere que el humano cree la app y la clave de servicio de Play).
- iOS: el humano ejecuta `eas build -p ios --profile production` en su terminal (inicio de sesión de Apple y 2FA),
  luego `eas submit -p ios` → TestFlight; añadir testers.
- Documentar en README y DOCUMENTACION_TECNICA (proceso, challenges, capturas del móvil).
