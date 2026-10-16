# Informe de auditoría y propuestas de mejora — TransferdeLuxe Central

Fecha: 11/10/2026 · Elaborado por Claude Code (auditoría de solo lectura + pruebas de carga de solo lectura en producción).
No se ha borrado ni modificado ningún dato. Único cambio aplicado: cabeceras de seguridad HTTP (ver §1.5).

---

## Parte 1 · Análisis técnico (rol: analista de software senior)

### 1.1 Resumen ejecutivo
La aplicación es sólida para la demo y el uso de una flota pequeña: **0 errores** en las pruebas de carga,
respuestas de 80–300 ms, sin fallos críticos de seguridad. Los puntos débiles aparecen al pensar en uso real
continuado: **crecimiento de la tabla de posiciones**, **validación de las posiciones enviadas**, **pérdida de
algunos puntos GPS en la app nativa** y **requisitos legales/de tienda** (política de privacidad).

### 1.2 Rendimiento y límites (medido en https://app.transfersvipluxe.com)
| Prueba | Resultado |
|---|---|
| Protocolo | HTTP/2 + HTTP/3, CDN de Hostinger delante, TLS ~90 ms |
| TTFB /login · /reservar | 0,27 s · 0,16 s (arranque en frío de / : 1,2 s) |
| Assets estáticos | caché 1 año inmutable, servidos desde CDN |
| Carga 5 conexiones | p50 81 ms · p99 483 ms · 40 req/s · 0 errores |
| Carga 20 conexiones | p50 288 ms · p99 707 ms · **61 req/s (techo)** · 0 errores |
| Carga 40 conexiones | p50 491 ms · p99 808 ms · 38 req/s · 0 errores |
| JS de /login | ~150 KB comprimido (react-dom 54 KB, polyfills 39 KB) |

**Conclusión:** un único proceso Node en Hostinger aguanta ~60 peticiones/s, más de 100 veces el tráfico de una
empresa de 3–10 conductores. Detalle curioso: el Brotli de la CDN pesa ~40 % más que el gzip (configuración de Hostinger).

### 1.3 Hallazgos por gravedad

**ALTO**
1. **Posiciones sin validar** — un conductor autenticado podría enviar coordenadas imposibles o una fecha futura
   (p. ej. 2099), y su posición en el mapa quedaría congelada. Arreglo: trigger que fuerce `registrado_en = now()`
   y compruebe rangos de lat/lng. Migración pequeña y aditiva.
2. **Tabla `posiciones` sin purga** — ~150 B/fila, 1 fila cada 12 s por conductor:
   10 conductores × 8 h ≈ 108 MB/mes → el plan gratuito (500 MB) se llena en ~4,5 meses. Arreglo: pg_cron
   diario que borre posiciones de más de 30 días (y `acciones_procesadas` antiguas).
3. **App nativa: puntos GPS que se pierden** — si una subida va lenta, la posición nueva se descarta en vez de
   encolarse, y de cada lote solo se envía la última (tras un túnel o zona sin cobertura se pierde el rastro).
4. **App nativa: parada silenciosa del GPS** — ante ciertos errores de sesión la tarea se apaga sin avisar al
   conductor. Arreglo: parar solo ante errores de sesión definitivos y mostrar notificación «GPS detenido».

**MEDIO**
5. `/api/geocodificar` (pública): la consulta a la BD va antes del límite de peticiones, no limita la longitud de
   la búsqueda ni escapa comodines, no comprueba si Nominatim responde 429 y no tiene límite global de 1 req/s.
6. Índices que faltan: `eventos_servicio(servicio_id, creado_en)`, `servicios(estado)`, `tickets_combustible(conductor_id)`.
7. Subida de fotos de ticket: se fía del tipo declarado por el móvil (no comprueba que realmente sea JPG/PNG) y la
   ruta web no tiene límite de peticiones.
8. Push: no se consultan los «recibos» de Expo, así que los tokens de móviles desinstalados se acumulan; no se
   re-registra el token si el sistema lo rota.
9. GPS web: fixes duplicados en cada reinicio del vigilante (gasto de batería en iPhone) y un oyente que falle
   impide que el resto reciba la posición.
10. Realtime publica tablas completas: cada cambio se evalúa contra la seguridad de cada suscriptor. Con 3 conductores
    no importa; con 50 sí. Arreglo: filtros por conductor en las suscripciones.

**BAJO**
11. Límite de peticiones en memoria: válido en Hostinger (un solo proceso), pero se pierde al reiniciar y no purga claves.
12. Batería: GPS en precisión alta cada 15 s incluso parado. Propuesta: precisión media + latido cada 60 s cuando
    el coche está detenido.
13. OSRM y teselas OSM públicos: válidos para demo, **no permitidos para uso comercial intensivo** → ver §2.2.
14. Polyfills de 113 KB que los navegadores modernos no necesitan.

### 1.3 bis · Estado tras aplicar las mejoras aprobadas (11–12/10)
Corregidos: 1 y 2 (migración 0009), 3 y 4 y 12 (GPS nativo sin pérdidas, aviso «GPS detenido», 1 punto/min parado),
5 y 6 (geocodificador endurecido, índices 0010), 7 y 8 (firma real de imágenes, recibos push), 11 (purga del límite en
memoria). Pendientes por bajo impacto con la flota actual: 9 (GPS web), 10 (filtros Realtime) y 13 (mapas comerciales,
documentado para la implantación real). 14 resultó no aplicar: los navegadores modernos no descargan los polyfills.

### 1.4 Lo que está bien
Idempotencia de acciones, cola offline, RLS en todas las tablas, `/api/demo/reset` protegido con secreto,
validación zod en servidor, fotos en bucket privado, service role nunca en el cliente, ruta OSRM con caché y límite global.

### 1.5 Cambio aplicado esta noche (bajo riesgo)
`next.config.ts`: HSTS, `X-Frame-Options: DENY` (anti-clickjacking), `X-Content-Type-Options: nosniff`,
`Referrer-Policy` y ocultar `X-Powered-By`. Sin CSP ni Permissions-Policy para no romper GPS, mapa ni Supabase.
Compilación correcta.

---

## Parte 2 · Visión de propietario (uso real en Transfers VIP Luxe)

### 2.1 Mejoras para la central
| # | Mejora | Valor | Esfuerzo |
|---|---|---|---|
| C1 | **Seguimiento de vuelos** (número de vuelo → hora real de llegada, avisa si se retrasa) | Muy alto (aeropuertos BCN/REU) | Medio (API AeroDataBox/FlightAware; hay planes gratuitos limitados) |
| C2 | **Tarifas y presupuesto automático** (por zona/km, suplementos noche, sillita, espera) en la página de reserva | Alto | Medio |
| C3 | **Clientes y empresas** (hoteles, agencias): ficha, historial, condiciones, servicios recurrentes | Alto | Medio |
| C4 | **Facturación** (Verifactu obligatorio en 2026–27 en España) o exportación a la gestoría | Alto | Alto |
| C5 | **Mantenimiento de flota**: ITV, seguro, revisiones por km con avisos (ya teníamos km) | Alto | Bajo-medio |
| C6 | **Subcontratas** (autobuses de 16 plazas): ficha del colaborador, envío del servicio por enlace | Medio | Medio |
| C7 | **Informes**: km, servicios y combustible por conductor/vehículo/mes; consumo l/100 km | Medio | Bajo |
| C8 | **Mensajes al cliente** (confirmación, «tu conductor está llegando» con enlace de seguimiento) por email/WhatsApp | Alto | Medio (WhatsApp Business tiene coste) |
| C9 | **Placa de recogida digital** (nombre del cliente en la pantalla del móvil para el aeropuerto) | Medio | Bajo |
| C10 | **Roles**: administrador / operador / solo lectura; registro de auditoría de quién cambió qué | Medio | Bajo |

### 2.2 Mejoras para la app de conductores
| # | Mejora | Valor | Esfuerzo |
|---|---|---|---|
| A1 | **Jornada laboral**: inicio/fin, pausas, horas acumuladas (registro horario obligatorio, RDL 8/2019) | Muy alto (legal) | Bajo-medio |
| A2 | **Checklist del vehículo** al empezar (luces, limpieza, daños con foto) | Alto | Bajo |
| A3 | **Firma o confirmación del cliente** al terminar (prueba de servicio) | Medio | Bajo |
| A4 | **Botón de incidencia/SOS** (accidente, avería, cliente no presentado con foto y hora) | Alto | Bajo |
| A5 | **Chat con la central** dentro de la app | Medio | Medio |
| A6 | **Modo ahorro de batería** del GPS (ver 1.3-12) | Medio | Bajo |
| A7 | **Mapas/rutas de producción**: servidor propio de rutas o proveedor de pago, teselas con licencia comercial | Necesario si se publica | Medio |

---

## Parte 3 · Aspectos legales y permisos

| Tema | Situación | Qué hace falta |
|---|---|---|
| **RGPD / LOPDGDD** — datos de clientes | La app guarda nombre, teléfono y direcciones | Política de privacidad, base legal (ejecución del contrato), plazos de conservación, contrato de encargado con Supabase/Hostinger (DPA, ya ofrecido por ambos; Supabase en UE-París ✔) |
| **Geolocalización de trabajadores** (art. 90 LOPDGDD, art. 20.3 ET) | GPS solo en servicio ✔ (interruptor) | **Informar por escrito** a los conductores (y representantes) antes de usarlo; nunca fuera de jornada; conservar lo mínimo (≈30 días) |
| **Registro de jornada** (art. 34.9 ET) | No existe | Ver A1; conservar 4 años |
| **Transporte (VTC / LOTT)** | Fuera del software | Autorizaciones VTC vigentes por vehículo; hoja de ruta/contrato previo exigible en inspección → la hoja de ruta de la app puede servir si incluye los datos obligatorios (titular, conductor, matrícula, origen, destino, hora) |
| **Subcontratación de autobuses** | Fuera del software | Contrato con la empresa colaboradora con autorización VD; registrar en la app quién hizo el servicio |
| **Facturación** | No existe | Verifactu / Ley Antifraude si se factura desde la app |
| **Apple App Store** | TestFlight ✔ | URL de política de privacidad, «App Privacy» (ubicación, fotos, identificadores), justificación del modo ubicación en segundo plano. App de uso interno → valorar distribución privada/Unlisted |
| **Google Play** | APK directo ✔ | Declaración de permisos de ubicación en segundo plano + **vídeo** de la función, formulario «Seguridad de los datos», tipo de servicio en primer plano (Android 14). Cuenta personal nueva: exige prueba cerrada con 12 testers durante 14 días antes de producción |
| **Licencias de mapas** | OSM/OSRM públicos | Atribución «© OpenStreetMap» visible ✔; para uso comercial, proveedor propio o de pago |
| **Página de reserva pública** | Sin aviso legal | Aviso legal, condiciones, casilla de privacidad, banner de cookies solo si se añaden cookies no técnicas |

---

## Parte 4 · Recomendación de prioridades

**Antes de la entrega (19/10) — bajo riesgo, mejoran la nota:**
1. Validación + purga de posiciones (hallazgos 1–2).
2. GPS nativo sin pérdidas y aviso de parada (3–4).
3. Endurecer geocodificar e índices (5–6).
4. Página de política de privacidad y aviso legal (requisito de tiendas y RGPD).
5. Documentar esta auditoría en la documentación técnica.

**Después del concurso (implantación real):** A1 jornada, C1 vuelos, C5 mantenimiento, A4 incidencias, C2 tarifas,
C8 avisos al cliente, A7 mapas comerciales, C4 facturación.
