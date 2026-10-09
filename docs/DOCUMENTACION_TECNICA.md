# TransferdeLuxe — Documentación técnica

> Borrador en Markdown. Al final se pasa a **un único Google Doc** (entregable 1).
> El historial de prompts NO va aquí: va en otro Google Doc.

## 1. Descripción del proyecto
_Pendiente._

## 2. Plataforma utilizada
Claude Code (agente de codificación en terminal / app de escritorio), modelo Claude Opus 5.5.

## 3. Arquitectura
_Pendiente._

## 4. Casos de uso
_Pendiente._

## 5. Proceso iterativo con la IA
- **09/10/2026**: preparación del entorno. Repo nuevo, reglas de las bases en `CLAUDE.md` para que el
  agente las respete, hook que registra cada prompt y script que exporta las transcripciones.
- **09/10/2026**: diseño con la IA (brainstorming guiado, una pregunta cada vez). Se analiza el formulario de la
  web de referencia y se decide: reserva pública + alta manual, PWA para el conductor, asignación manual con
  sugerencia, lectura de tickets con Claude Haiku 5.5, stack Next.js + Supabase + OpenStreetMap, desplegado en Hostinger Cloud (Node.js Web App) con dominio propio.
  Resultado: `docs/superpowers/specs/2026-10-09-centro-control-design.md`.
- **09/10/2026**: fase 1, lógica de dominio con TDD (test que falla, implementación mínima, test en verde).
  La IA escribe primero los tests y después el código de: máquina de estados del servicio con permisos por rol,
  distancias, duración estimada y sugerencia de conductor, cálculos de gasto y consumo de combustible, y lector
  de tickets (interfaz `LectorTicket` + implementación con Claude Haiku 5.5, validación con zod y comprobación
  de coherencia litros x precio = importe).
- **10/10/2026**: fase 4, centro de control. La IA construye la central: listado de servicios con filtros, ficha
  del servicio y alta manual; asignación con sugerencia de conductor (disponibilidad, plazas, vehículo en taller);
  panel en vivo con Supabase Realtime (posiciones, estados e incidencias); hoja de ruta diaria con reasignación
  por arrastre; y gestión de flota, conductores y ajustes (plazo de respuesta y umbral sin señal), con validación
  zod en las acciones de servidor.
- **10/10/2026**: fase 5, app del conductor. La IA construye la PWA (instalable, service worker y navegación
  móvil), el GPS con envío de posición, aceptar/rechazar un servicio con plazo de respuesta, el servicio en curso
  (en camino, carga y descarga) con cola de acciones para tramos sin cobertura, el ticket de combustible leído con
  OCR local en el navegador y, al final, el historial de 7 días del conductor y el panel de combustible de la
  central (KPI, gráfico de gasto por mes y tabla con miniaturas firmadas).

## 6. Challenges y soluciones
- **OCR de tickets: ¿OCR clásico o IA?** Se comparan OCR.space (25.000 peticiones/mes gratis, pero solo texto
  plano), Mindee, Tabscanner, Azure y Google Document AI. Se elige Claude Haiku 5.5 porque devuelve los datos ya
  estructurados y aguanta formatos de ticket distintos, a ~0,0003 $ por ticket. El lector queda detrás de una
  interfaz para poder cambiar de proveedor.
- **GPS en una PWA**: el navegador no envía la ubicación en segundo plano (sobre todo en iPhone). Se acepta para
  el hackathon (la app se usa abierta durante el servicio) y se añade un simulador de ruta para la demo.
- **Pedidos de más de 8 pasajeros**: la flota propia es de 7–8 plazas; se marcan como «subcontratar».
- **Lector de tickets sin APIs de pago**: se sustituyó la lectura con Claude Haiku por OCR local gratuito (Tesseract.js en el navegador + reglas de extracción en `lector/extraer.ts`), porque el responsable no admite conexiones a APIs de pago. Claude Haiku queda como alternativa desactivada.
- **Realtime no entregaba eventos**: el canal se suscribía antes de que el JWT del usuario llegara al socket, así
  que las políticas RLS descartaban los eventos. Solución: `getSession` + `realtime.setAuth` antes de suscribir.
- **Service worker de otro proyecto en localhost**: servía bundles viejos y el panel parecía no actualizarse.
  Solución: dar de baja el service worker y limpiar la caché del origen en desarrollo.
- **Cola sin cobertura con carreras e idempotencia**: las acciones guardadas offline podían duplicarse o
  pisarse al reintentar. Solución: cola por conductor, clave de asignación normalizada, acciones idempotentes
  (tabla `acciones_procesadas`), reversión local si el servidor rechaza y drenaje global al volver la conexión.
- **Tarjeta a pantalla completa que podía bloquear al conductor**: la tarjeta de servicio nuevo tapaba toda la
  app si algo fallaba. Se rediseñó para poder cerrarse y responder siempre, sin dejar la interfaz inutilizable.
- **Validación de rutas de fotos**: el ticket recibía `foto_path` del cliente. Se valida que la ruta pertenezca
  al conductor y al bucket privado `tickets`; las miniaturas de la central usan URL firmadas de 1 hora.

## 7. Capturas
Ver `docs/capturas/`.
