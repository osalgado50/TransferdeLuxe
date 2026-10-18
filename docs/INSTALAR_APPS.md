# Cómo probar TransferdeLuxe en el móvil — guía para el jurado

TransferdeLuxe tiene tres partes. Solo la app del conductor se instala; las otras dos se abren en el navegador.

| Parte | Quién la usa | Cómo se abre |
|---|---|---|
| Web de reservas | El cliente | https://app.transfersvipluxe.com (cualquier móvil u ordenador) |
| Centro de control | La central | https://app.transfersvipluxe.com/central (mejor en ordenador o tableta) |
| App del conductor «TDL Conductor» | Los conductores | **Android**: se instala (paso 1). **iPhone**: versión web (paso 2) o TestFlight por invitación |

Todo son **datos de demostración** (marca, clientes y conductores inventados). La empresa de demo funciona sola: entran
reservas, la central asigna y tres conductores de demo fichan, trabajan y se desfichan por turnos.

## Cuentas de demo

No hace falta registrarse. En la pantalla de acceso (web y app) hay un recuadro **«Cuentas de demo»**: pulsa **«Usar»**
en la cuenta que quieras y luego **«Entrar»** (la contraseña de prueba se rellena sola).

| Cuenta | Para qué |
|---|---|
| `central@transferdeluxe.test` | Centro de control (y modo central en la app) |
| `conductor1@transferdeluxe.test` | Marc · turno de tarde (13:30–22:00) |
| `conductor2@transferdeluxe.test` | Laia · turno de mañana (06:00–14:30) |
| `conductor3@transferdeluxe.test` | Jordi · turno de noche (21:30–06:30) · **recomendada para probar de día**, porque a esas horas la demo no la usa |

## 1. Android: instalar la app

> **Es normal que Android avise.** La app es una versión de prueba que no está en Google Play, así que Android no puede
> comprobar quién la firma y te pedirá confirmar. Cuando lo haga, elige siempre **«Descargar de todas formas»** o
> **«Instalar de todas formas»**. La app no pide datos personales: solo se entra con las cuentas de demo.

1. En el móvil Android, abre en Chrome **https://app.transfersvipluxe.com/android**. Se descarga `TDL Conductor` (APK,
   unos 150 MB; mejor con wifi). Enlace directo, por si el corto no abre:
   https://expo.dev/artifacts/eas/sLajvHRbo399obLDSDlTB5zOJ-zBxFYt0m8varQodak.apk
   Si Chrome avisa de que el archivo puede ser dañino: **Descargar de todas formas**.
2. Al terminar, toca **Abrir** en el aviso de descarga (o búscalo en *Archivos → Descargas*).
3. Si Android avisa de que Chrome no puede instalar aplicaciones de origen desconocido: **Ajustes → Permitir de esta
   fuente** y vuelve atrás.
4. Toca **Instalar**. Aparecerá un aviso de **Google Play Protect** diciendo que no se reconoce al desarrollador o que la
   app no está verificada. **Fuerza la instalación**: toca **Más detalles → Instalar de todas formas** (según el móvil,
   «Instalar igualmente»). Si pregunta si quieres enviar la app para que la analicen, puedes decir que no.
5. Abre **TDL Conductor**, ciérrala del todo y vuelve a abrirla: así descarga la última actualización.
6. Entra con una cuenta de conductor (recuadro «Cuentas de demo» → **Usar** → **Entrar**) y acepta los permisos:
   - **Notificaciones**: para que te lleguen los servicios nuevos.
   - **Ubicación**: para que la central vea tu coche. «Mientras se usa» basta para probar.

El enlace de descarga funciona hasta el **30/10/2026**.

## 2. iPhone: versión web del conductor (sin instalar nada)

1. En Safari, abre **https://app.transfersvipluxe.com/conductor**.
2. «Cuentas de demo» → **Usar** en `conductor3@transferdeluxe.test` → **Entrar**.
3. Opcional, para tenerla como una app: botón **Compartir → Añadir a pantalla de inicio**.

Tiene las mismas pantallas que la app: servicios del día, aceptar, en camino, carga y descarga, avisar al cliente,
ticket de combustible, jornada e historial. Lo único que no hace es enviar el GPS con el móvil bloqueado.

La app nativa para iPhone está en **TestFlight** y solo se instala por invitación: si queréis probarla, pedidla por el
canal del concurso indicando el correo de vuestro Apple ID.

## 3. Prueba completa en 5 minutos

1. **Ordenador**: entra en https://app.transfersvipluxe.com/central con `central@…`. Verás el mapa con los coches de demo.
2. **Móvil**: entra en la app (o en la web del conductor) con `conductor3@…` y activa **En servicio**.
3. **Ordenador**: en la columna de la derecha, en una «Reserva nueva», pulsa **Asignar** y elige a *Jordi Demo*
   («Asignar igualmente» si está fuera de turno).
4. **Móvil**: llega **SERVICIO NUEVO** con cuenta atrás → **ACEPTAR**. En la central cambia al momento.
5. **Móvil**: abre el servicio → **Salgo hacia la recogida** → **CARGA** → **DESCARGA**. En la central se ve cada paso y
   el coche en el mapa.
6. **Móvil**: **Avisar al cliente** muestra el mensaje de WhatsApp con el enlace de seguimiento (no hace falta enviarlo).
7. **Móvil**: pestaña **Ticket** → **Elegir de la galería** o **Hacer foto** a un ticket de gasolinera: los datos se
   rellenan solos. Se ve en la central, en *Combustible*.
8. Para reservar como cliente: https://app.transfersvipluxe.com en cualquier móvil (datos inventados, por favor).

## Al terminar

- En la app, pon **Fuera de servicio** y pulsa **Salir**: deja de enviarse tu ubicación.
- Si un servicio no lo aceptas en 4 minutos, lo acepta el conductor de demo: la demo sigue funcionando sola.
