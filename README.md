# TransferdeLuxe

**Demo en línea:** https://app.transfersvipluxe.com — cuentas `central@transferdeluxe.test` y `conductor1..3@transferdeluxe.test` (la contraseña de prueba se muestra en la pantalla de acceso).

Proyecto para el **Hackathon de Vibe Coding — Máster en IA de Big School (Edición 7)**,
desarrollado al 100 % con vibe coding usando **Claude Code**.

> Descripción, demo y credenciales de prueba: pendientes.

## Evidencia del desarrollo
- `docs/prompts/PROMPTS.md`: registro automático de cada prompt.
- `docs/prompts/transcripciones/`: transcripciones exportadas de las sesiones de Claude Code.
- `docs/DOCUMENTACION_TECNICA.md`: borrador de la documentación técnica.

## Puesta en marcha

```bash
cp .env.example .env.local   # rellenar con tus claves (nunca se suben a git)
npm i
npm run seed
npm run dev
```

## Tests E2E

```bash
npm run test:e2e   # resiembra la demo (globalSetup) y ejecuta Playwright; reutiliza el servidor en :3000 si ya corre
```

Requiere `.env.local` con `DEMO_PASSWORD`. Cubre el flujo reserva → asignación → aceptación → carga → descarga y el rechazo con alerta en la central.

## Base de datos

Las migraciones están en `supabase/migrations/` y se aplican **en orden** en un proyecto Supabase nuevo
(SQL Editor o `supabase db push`): `0001_esquema` → `0002_rls` → `0003_funciones` → `0004_endurecer`.
Incluyen tablas, publicación Realtime, bucket privado `tickets`, políticas RLS/Storage y el cron `expirar-asignaciones`
(`0003` requiere la extensión `pg_cron`; es idempotente: reprograma el job si ya existe).
Después: `cp .env.example .env.local`, rellenar claves y `npm run seed`.
(Comprobado el 10/10/2026: el proyecto desplegado coincide con estas cuatro migraciones, sin cambios manuales.)

## Reinicio diario de la demo

`GET /api/demo/reset` vuelve a sembrar la demo (solo con `NEXT_PUBLIC_MODO_DEMO=true`; 404 en otro caso).
Exige la cabecera `Authorization: Bearer $CRON_SECRET` (401 si falta o no coincide). Define `CRON_SECRET` en el entorno del servidor
(`openssl rand -hex 32`) además de `DEMO_PASSWORD`. Las fotos de ticket van embebidas en `src/lib/demo/fotos.ts`
(se regeneran con `npx tsx scripts/tickets-demo.ts`), así que no dependen del directorio de trabajo.
En modo demo se borran todos los usuarios que no sean los de demo, y los conductores nuevos deben usar `@transferdeluxe.test`.

Programarlo cada día hacia las 05:00 (Europe/Madrid; el cron del servidor suele ir en UTC, 03:00 UTC en verano y 04:00 en invierno):

- **Cron de Hostinger** (hPanel → Avanzado → Cron Jobs), comando:
  `curl -fsS -H "Authorization: Bearer TU_CRON_SECRET" https://TU_DOMINIO/api/demo/reset` con minuto `0`, hora `3` (UTC), resto `*`.
- **pg_cron + pg_net** en Supabase:
  ```sql
  create extension if not exists pg_net;
  select cron.schedule('reset-demo', '0 3 * * *', $$
    select net.http_get(url := 'https://TU_DOMINIO/api/demo/reset',
                        headers := jsonb_build_object('Authorization', 'Bearer TU_CRON_SECRET'))
  $$);
  ```
  (pg_cron usa UTC; ajusta la hora si cambia el horario de verano.)

Aún no está programado: falta la URL de despliegue.
