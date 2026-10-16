# Checklist de entrega — Hackathon Vibe Coding E7

## Plazos (hora peninsular española)
- [x] **Inscripción** hecha y confirmada por correo (09/10/2026)
- [ ] **Entrega** por el formulario oficial antes del **19/10/2026 a las 23:59** (mejor terminar la tarde del 19)
- [ ] App en marcha durante la evaluación, **del 20 al 27/10** (sin planes que se duerman ni caduquen)
- Ganadores: **28/10/2026**. Dudas: Discord `🏆┃hackathon-vibecoding-e7` o BIG Helper @bighelper.ai

## Carpeta de Google Drive (obligatoria) — permisos «Cualquier persona con el enlace puede ver»
- [ ] 1 · **Documentación técnica**: UN solo Google Doc (no Word, PDF ni TXT)
  - [ ] Descripción · Plataforma(s) · Arquitectura · Casos de uso · Proceso iterativo · Challenges y soluciones · Capturas
- [ ] 4 · **Historial de prompts**: otro Google Doc aparte (indica la plataforma de cada prompt)
- [ ] 5 · **Vídeo demo** ≤ 5 min, subido a la carpeta
- [ ] Permisos revisados **en la carpeta y en cada archivo**, abriendo cada enlace en una ventana de incógnito

- [ ] La URL de la app, las credenciales de prueba y el enlace al repo también dentro del Doc técnico (las bases
      no admiten documentos distintos a los indicados en la carpeta, así que nada de un Doc extra)

## Fuera de Drive
- [ ] 2 · **URL de la app desplegada** + credenciales de prueba (nunca reales)
- [ ] 3 · **Repo de GitHub** público, o privado compartido con `automatizaciones@thebigschool.com`

## Formulario: un enlace por cada elemento
- [ ] Carpeta Drive · Doc técnico · Doc de prompts · Vídeo · URL de la app · Repo GitHub

## Antes de enviar
- [ ] Sin datos personales reales ni credenciales reales en el código, las capturas, el vídeo y los docs
- [ ] `.env` fuera del repo (`git log -p | grep -i key` limpio)
- [ ] Mínimo 3 funcionalidades principales funcionando en producción
- [ ] Tras enviar: **NO tocar** el repo, los Docs ni la carpeta de Drive

## Enlaces (creados el 09/10/2026; todavía SIN compartir)
- Carpeta Drive: https://drive.google.com/drive/folders/1oqMbKt10XVC0Z_JMvuYLVFqUAfb0MYWQ
- Doc técnico: https://docs.google.com/document/d/1A6zqLfzsIXsSu6ttfADWpVvzx7JFqvA2W3fxh5KMf9o/edit
- Doc de prompts: https://docs.google.com/document/d/1QxtpA9rqS2ZgTRGjzdWs-jSxXKbWTD-87fOPjV2JPw8/edit
- Repo (privado): https://github.com/osalgado50/TransferdeLuxe → antes de entregar: `gh api -X PUT repos/osalgado50/TransferdeLuxe/collaborators/<usuario>` o invitar a automatizaciones@thebigschool.com desde Settings → Collaborators
- App desplegada: https://app.transfersvipluxe.com

## Criterios del jurado (bases 4.2)
Complejidad y funcionalidad · Innovación y originalidad · Calidad del vibe coding · Experiencia de usuario ·
Utilidad y aplicabilidad. Proceso: revisión inicial → testing funcional → evaluación técnica → deliberación.
Bases completas: `docs/Bases-Hackaton-Vibecoding-E7.docx.pdf` (local, no versionado).

## Compilación nativa final (pendiente, acordada el 11/10)
- [ ] Imagen de arranque con margen (`movil/assets/images/splash-icon-v2.png` → `app.config.ts` expo-splash-screen).
- [ ] Sonidos propios de notificación (servicio nuevo, alarma de incidencia…) como ficheros en la app.
- [ ] Compilar Android (Claude) e iOS (responsable) y avisar a los conductores para que instalen; después las
      actualizaciones automáticas siguen funcionando con la nueva huella.

## Estado a 12/10/2026
- [x] App nativa TDL Conductor: APK Android funcionando, iOS en TestFlight.
- [x] Auditoría técnica/legal (`docs/INFORME_AUDITORIA.md`) y mejoras aprobadas: seguridad, GPS sin pérdidas, purga
      30 días, páginas legales, módulos (jornada, incidencias, checklist, mantenimiento, informes, vuelos).
- [x] Guion del vídeo actualizado (sin «Restablecer demo»).
- [x] Servicios de ejemplo del 20 al 27/10 añadidos (32, nota «Servicio de ejemplo para la evaluación»; sin borrar nada).
- [ ] Revisar que no haya datos reales visibles en la demo.

## Estado a 10/10/2026 (madrugada)
- [x] App completa en local: reserva, central (panel en vivo, servicios, asignación, hoja de ruta, flota, combustible),
      app del conductor (PWA, GPS, aceptar/rechazar, en curso offline, ticket con OCR), datos de demo y reinicio.
- [x] 70 tests unitarios + 2 E2E en verde; revisión final completa sin hallazgos críticos.
- [x] Guion del vídeo: `docs/GUION_VIDEO.md`.
- [x] Despliegue en Hostinger: https://app.transfersvipluxe.com (E2E en producción 2/2). Reinicio diario por GitHub Actions.
- [x] Dominio definitivo con SSL (Let's Encrypt): https://app.transfersvipluxe.com
- [ ] Capturas de la app del conductor en el móvil.
- [ ] Pasar `DOCUMENTACION_TECNICA.md` al Google Doc técnico y las transcripciones al Doc de prompts.
- [ ] Grabar el vídeo.
- [ ] Compartir el repo con automatizaciones@thebigschool.com y permisos de Drive.
