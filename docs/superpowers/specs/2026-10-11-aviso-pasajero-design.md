# Aviso al pasajero (WhatsApp «un toque» + seguimiento en directo) · Diseño

Fecha: 11/10/2026 · Aprobado por el responsable («B y seguimiento»).

## Decisiones
1. **Página pública de seguimiento** `/s/<token>`: sin login, `noindex`, token aleatorio largo por servicio (tabla
   `seguimientos(servicio_id, token, creado_en, caduca_en)`), válido desde «en camino» hasta 30 min después de
   completar/cancelar. Muestra: mapa con la posición del coche (posicion_actual del conductor, refresco ~15 s, sin
   exponer otros datos), hora estimada de llegada (ETA por /api/ruta del servidor, con freno), nombre de pila del
   conductor, vehículo y matrícula, estado («De camino», «Llegando», «A bordo», «Finalizado»). Nunca muestra datos del
   cliente ni de otros servicios. Idioma es/en según el cliente (`Accept-Language` o campo idioma si existe).
2. **WhatsApp «un toque»** (gratis, sin API): enlace `https://wa.me/<tel normalizado E.164>?text=<mensaje>` que
   abre el chat del cliente con el texto ya escrito; el humano pulsa «enviar». Momentos: al pulsar «En camino» (con
   ETA y enlace de seguimiento), retraso previsto (contador de puntualidad en rojo) y «llegando». Botón grande verde
   en la app del conductor (nativa y PWA) y en la ficha de la central (web y móvil). Recordatorio: enviarlo parado.
3. **Registro**: al pulsar el botón se anota un evento `aviso_cliente` (canal whatsapp, motivo) → Actividad en vivo.
4. **Preparado y apagado**: proveedor `WhatsAppCloud` (Meta WhatsApp Business Platform, plantillas aprobadas) que
   solo se activa con `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID`; sin claves, no aparece. Coste de pago por mensaje.
5. **Legal**: mensajes de servicio (base legal: contrato). Texto en /reservar y /privacidad: «te avisaremos del
   estado de tu traslado por WhatsApp o email». Demo con teléfonos ficticios.
