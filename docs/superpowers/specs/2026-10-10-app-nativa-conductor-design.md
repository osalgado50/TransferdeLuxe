# TVL Conductor — App nativa (Android/iOS) · Diseño

Fecha: 10/10/2026 · Estado: aprobado en conversación, pendiente de revisión escrita · Plataforma: Claude Code

## 1. Objetivo
Sustituir, para los conductores, la PWA por una app nativa que envíe la posición **también con la pantalla
bloqueada o en segundo plano** y reciba **notificaciones push** de servicio nuevo con la app cerrada. La central
web no cambia. La PWA sigue disponible (y es la que prueba el jurado).

Criterio de éxito: con la app en segundo plano y la pantalla bloqueada, la central recibe posiciones cada ~15 s;
el conductor recibe una notificación al asignarle un servicio; el resto del flujo (aceptar/rechazar, en camino,
CARGA, DESCARGA, ticket) funciona igual que en la PWA. Distribución: TestFlight (iOS) y prueba interna de Google Play.

## 2. Decisiones
| Tema | Decisión |
|---|---|
| Framework | Expo (React Native, TypeScript), Expo Router, compilación en la nube con EAS Build |
| Ubicación | `movil/` dentro del mismo repo (app independiente con su propio package.json) |
| Backend | El mismo Supabase (Auth, RLS, Realtime, Storage) y las mismas reglas de negocio |
| Acciones de servicio | Nueva ruta API en Next `POST /api/conductor/accion` (Bearer JWT de Supabase) que reutiliza `ejecutarAccion` + `repoSupabase` (las Server Actions de Next no se pueden llamar desde la app) |
| GPS | `expo-location` con `startLocationUpdatesAsync` + `expo-task-manager` (segundo plano); Android: servicio en primer plano con notificación fija; iOS: `UIBackgroundModes: location`, permiso «Siempre» con justificación |
| Envío | Inserta en `posiciones` con el cliente de Supabase (RLS `conductor_id = auth.uid()`), cola local con reintento (AsyncStorage) |
| Push | `expo-notifications` + Expo Push Service; tabla `dispositivos_push(conductor_id, token, plataforma)`; trigger/función en servidor que notifica al pasar un servicio a `asignado` |
| Mapa | `react-native-maps` (Apple Maps en iOS, Google en Android) con la ruta de `/api/ruta` y avisos de proximidad (`lib/dominio/navegacion.ts` compartido) |
| Ticket | Cámara con `expo-image-picker`; OCR: se mantiene Tesseract.js en la web; en la app nativa la primera versión sube la foto y el conductor rellena los campos (OCR nativo como mejora) |
| Identidad | Nombre «TVL Conductor», bundle/package `com.transfersvipluxe.conductor`, icono VIP LUXE, paleta de marca |
| Distribución | iOS: TestFlight con la cuenta personal de Apple Developer. Android: pista de prueba interna (hasta 100 testers) con la cuenta personal de Google Play |

## 3. Pantallas (mismas que la PWA)
Login · Hoy + Próximos días · Servicio nuevo (aceptar/rechazar con cuenta atrás, motivo) · Servicio en curso
(mapa con ruta, banner distancia/tiempo, avisos 500/100 m, botón grande de paso, Google Maps/Waze, llamar) ·
Ticket · Historial · interruptor En servicio con estado «📍 última posición enviada hace Xs».

## 4. Código compartido
La lógica pura de `src/lib/dominio/*` (estados, navegación, plazo, capacidad…) se importa desde `movil/` por ruta
relativa configurada en Metro/tsconfig, sin duplicar.

## 5. Seguridad
- La app usa solo la clave anónima de Supabase y la sesión del conductor; nunca la service role.
- `/api/conductor/accion` valida el JWT (`supabase.auth.getUser(token)`), comprueba rol conductor y delega en
  `ejecutarAccion` (mismas reglas e idempotencia que la PWA).
- Tokens push solo legibles por su conductor y por el servidor.

## 6. Fuera de alcance (v1)
OCR nativo, modo offline completo de mapas, publicación en tiendas abiertas (solo pruebas internas/TestFlight).

## 7. Pasos humanos (se piden de uno en uno)
1. Cuenta de Expo (usuario). 2. Apple: Team ID, crear app en App Store Connect, iniciar sesión en `eas build`
desde su terminal (contraseña y 2FA solo las teclea él). 3. Google Play: crear app, pista de prueba interna, subir
el primer AAB, emails de testers. 4. Probar en móviles reales.
