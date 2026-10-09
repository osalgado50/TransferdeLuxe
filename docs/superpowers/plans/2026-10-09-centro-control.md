# TransferdeLuxe — Centro de control · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web app Next.js con reserva pública, centro de control en tiempo real y PWA del conductor (aceptar/rechazar,
en camino/carga/descarga, GPS, tickets de combustible leídos con Claude Haiku), desplegada en Hostinger con Supabase.

**Architecture:** Un único proyecto Next.js (App Router, TypeScript) con tres zonas por ruta (`/reservar`,
`/central`, `/conductor`). La lógica de dominio vive en módulos puros (`src/lib/dominio`) probados con Vitest. Los
cambios de estado pasan por Server Actions que validan con la máquina de estados y escriben con la clave de servicio;
las lecturas y el tiempo real usan el cliente de Supabase con RLS.

**Tech Stack:** Next.js 15 · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Realtime, Storage,
pg_cron) · `@supabase/ssr` · zod · Leaflet + react-leaflet · @dnd-kit/core · recharts · `@anthropic-ai/sdk` ·
Vitest · Playwright. Hosting: Hostinger Cloud Startup (Node.js Web App, Node 22).

**Spec:** `docs/superpowers/specs/2026-10-09-centro-control-design.md`

## Global Constraints

- Todo el código lo genera la IA; commits pequeños en `main` con mensaje descriptivo y la línea
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Sin datos personales ni credenciales reales: solo datos inventados y cuentas `@transferdeluxe.test`. Ni el nombre,
  ni la marca, ni el contacto de la empresa real de referencia.
- Secretos solo en `.env.local` (local) y en el panel de Hostinger; en el repo solo `.env.example`.
- `SUPABASE_SERVICE_ROLE_KEY` y `ANTHROPIC_API_KEY` solo en código de servidor (`import "server-only"`).
- Modelo del lector: `claude-haiku-5-5`.
- Zona horaria de negocio: `Europe/Madrid`; en BD siempre `timestamptz`.
- Interfaz en español. Fecha límite: 19/10/2026 23:59; después, ni un commit.
- Ajustes por defecto: plazo de respuesta 15 min, umbral sin señal 5 min, GPS cada ~15 s.
- Flota propia: plazas 7 u 8. `pasajeros > 8` ⇒ `subcontratar = true`.
- Al cerrar cada bloque (fase) añadir entrada en `docs/DOCUMENTACION_TECNICA.md` → «Proceso iterativo» y, si hubo
  problemas, «Challenges y soluciones».

## Review Focus

1. **Doble clic / reintento offline en CARGA o DESCARGA**: el mismo `idAccion` enviado dos veces no debe avanzar dos
   estados ni duplicar eventos → test en Task 8 (`ejecutarAccion` idempotente).
2. **Conductor que actúa sobre un servicio que ya no es suyo** (reasignado o expirado mientras tenía la tarjeta
   abierta): debe recibir error claro, no cambiar nada → test en Task 3 (`esAsignado: false`) y Task 8.
3. **Servicio a medianoche / cambio de día**: la hoja de ruta y los solapes usan hora de Madrid; un servicio a las
   00:30 pertenece al día siguiente → test en Task 4 (`diaMadrid`).
4. **Ticket ilegible o respuesta de la IA sin JSON**: el conductor debe poder seguir a mano, no ver un error 500 →
   test en Task 6 (`parsearRespuesta` con texto basura devuelve todo `null` y `confianza: 'baja'`).
5. **Reserva con vuelta**: debe crear dos servicios enlazados en ambos sentidos y alerta; vuelta sin fecha es inválida
   → test en Task 9 (`esquemaReserva`).

---

## Mapa de ficheros

```
src/
  app/
    layout.tsx, page.tsx, globals.css, manifest.ts
    login/page.tsx, login/actions.ts
    reservar/page.tsx, reservar/FormularioReserva.tsx, reservar/actions.ts
    api/geocodificar/route.ts
    api/tickets/leer/route.ts
    central/layout.tsx, central/page.tsx (panel en vivo)
    central/servicios/page.tsx, central/servicios/[id]/page.tsx, central/servicios/nuevo/page.tsx
    central/ruta/page.tsx, central/combustible/page.tsx, central/flota/page.tsx
    central/actions.ts
    conductor/layout.tsx, conductor/page.tsx, conductor/servicio/[id]/page.tsx
    conductor/ticket/page.tsx, conductor/historial/page.tsx, conductor/actions.ts
  components/
    mapa/MapaFlota.tsx, mapa/MapaTrayecto.tsx
    central/ColumnaAlertas.tsx, central/Contadores.tsx, central/TablaServicios.tsx,
    central/DialogoAsignar.tsx, central/TableroRuta.tsx, central/GraficoCombustible.tsx, central/BotonesDemo.tsx
    conductor/InterruptorServicio.tsx, conductor/TarjetaServicioNuevo.tsx, conductor/BotonPaso.tsx,
    conductor/CapturaTicket.tsx
    comun/CampoDireccion.tsx, comun/EstadoBadge.tsx
  lib/
    dominio/estados.ts, dominio/geo.ts, dominio/sugerencia.ts, dominio/combustible.ts, dominio/tipos.ts
    lector/tipos.ts, lector/parsear.ts, lector/claude.ts, lector/index.ts
    reserva/esquema.ts
    supabase/servidor.ts, supabase/navegador.ts, supabase/admin.ts, supabase/sesion.ts
    servicios/acciones.ts (ejecutarAccion, asignar, crear)
    demo/datos.ts, demo/seed.ts, demo/rutas.ts
    offline/cola.ts
    limite.ts (rate limit)
  middleware.ts
supabase/migrations/0001_esquema.sql, 0002_rls.sql, 0003_funciones.sql
scripts/seed.ts
tests/unit/*.test.ts, tests/e2e/flujo.spec.ts
public/icon-192.png, public/icon-512.png, public/sw.js, public/demo/ticket-*.jpg
```

---

## Fase 0 · Base del proyecto

### Task 1: Scaffold Next.js + herramientas de test

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/*` (scaffold), `vitest.config.ts`,
  `playwright.config.ts`, `.env.example`, `tests/unit/humo.test.ts`
- Modify: `README.md`, `.gitignore`

**Interfaces:**
- Produces: scripts `npm run dev | build | start | test | test:e2e | seed`; alias `@/` → `src/`.

- [ ] **Step 1: Crear el proyecto en un directorio temporal y moverlo a la raíz** (la raíz ya tiene ficheros)

```bash
cd /Users/mac2019/dev/TransferdeLuxe
npx create-next-app@15 .tmp-app --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack --yes
rsync -a --exclude .git --exclude README.md --exclude .gitignore .tmp-app/ ./ && rm -rf .tmp-app
npm install @supabase/supabase-js @supabase/ssr zod leaflet react-leaflet @dnd-kit/core recharts @anthropic-ai/sdk server-only
npm install -D vitest @vitejs/plugin-react vite-tsconfig-paths @playwright/test @types/leaflet tsx dotenv
```

- [ ] **Step 2: Configurar Vitest y Playwright**

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { include: ["tests/unit/**/*.test.ts"], environment: "node" },
});
```

`playwright.config.ts`:
```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", locale: "es-ES", timezoneId: "Europe/Madrid" },
  webServer: process.env.E2E_BASE_URL ? undefined : { command: "npm run dev", port: 3000, reuseExistingServer: true },
});
```

En `package.json` → `scripts`:
```json
"test": "vitest run",
"test:e2e": "playwright test",
"seed": "tsx scripts/seed.ts"
```

- [ ] **Step 3: Test de humo**

`tests/unit/humo.test.ts`:
```ts
import { expect, test } from "vitest";
test("vitest funciona", () => expect(1 + 1).toBe(2));
```
Run: `npm test` → Expected: 1 passed.

- [ ] **Step 4: `.env.example` y README**

`.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
NEXT_PUBLIC_MODO_DEMO=true
DEMO_PASSWORD=
```
Añadir a `.gitignore`: `.tmp-app/`, `test-results/`, `playwright-report/`.
README: sección «Puesta en marcha» (`cp .env.example .env.local`, `npm i`, `npm run seed`, `npm run dev`).

- [ ] **Step 5: Verificar build y commit**

Run: `npm run build` → Expected: build OK.
```bash
git add -A && git commit -m "Scaffold Next.js 15 con Tailwind, Vitest y Playwright"
```

### Task 2: Esquema de base de datos, RLS y funciones en Supabase

**Files:**
- Create: `supabase/migrations/0001_esquema.sql`, `0002_rls.sql`, `0003_funciones.sql`, `src/lib/dominio/tipos.ts`

**Interfaces:**
- Produces: tablas `perfiles, vehiculos, servicios, eventos_servicio, posiciones, posicion_actual,
  tickets_combustible, lugares_frecuentes, ajustes, acciones_procesadas`; función `expirar_asignaciones()`;
  función `es_operador()`; bucket privado `tickets`; tipos TS en `tipos.ts`.

Prerrequisito (humano): proyecto de Supabase creado y claves en `.env.local`. La migración se aplica con la herramienta
MCP `apply_migration` de Supabase (o pegando el SQL en el editor SQL). Extensión `pg_cron` habilitada.

- [ ] **Step 1: `0001_esquema.sql`**

```sql
create type rol_usuario as enum ('operador','conductor');
create type estado_servicio as enum ('pendiente','asignado','aceptado','en_camino','recogido','completado','cancelado','subcontratado');
create type tipo_vehiculo as enum ('sedan','minivan','minivan_premium','microbus','minibus');

create table vehiculos (
  id uuid primary key default gen_random_uuid(),
  matricula text not null unique,
  modelo text not null,
  plazas int not null check (plazas between 1 and 19),
  estado text not null default 'activo' check (estado in ('activo','taller')),
  km_actuales int not null default 0
);

create table perfiles (
  id uuid primary key references auth.users on delete cascade,
  rol rol_usuario not null,
  nombre text not null,
  telefono text,
  vehiculo_habitual_id uuid references vehiculos
);

create table servicios (
  id uuid primary key default gen_random_uuid(),
  cliente_nombre text not null,
  cliente_apellidos text not null default '',
  cliente_email text not null,
  cliente_telefono text not null,
  origen_texto text not null, origen_lat double precision, origen_lng double precision,
  destino_texto text not null, destino_lat double precision, destino_lng double precision,
  fecha_hora_recogida timestamptz not null,
  pasajeros int not null check (pasajeros between 1 and 19),
  maletas int not null default 0 check (maletas between 0 and 19),
  tipo_vehiculo_pedido tipo_vehiculo not null default 'minivan',
  numero_vuelo text,
  notas text,
  origen_pedido text not null check (origen_pedido in ('web','manual')),
  servicio_vuelta_id uuid references servicios on delete set null,
  conductor_id uuid references perfiles,
  vehiculo_id uuid references vehiculos,
  estado estado_servicio not null default 'pendiente',
  asignado_en timestamptz,
  plazo_respuesta_min int not null default 15,
  duracion_estimada_min int not null default 45,
  subcontratar boolean not null default false,
  ultima_incidencia text,           -- 'rechazado: <motivo>' | 'expirado'
  incidencia_vista boolean not null default true,
  creado_en timestamptz not null default now()
);
create index on servicios (fecha_hora_recogida);
create index on servicios (conductor_id, fecha_hora_recogida);

create table eventos_servicio (
  id bigint generated always as identity primary key,
  servicio_id uuid not null references servicios on delete cascade,
  tipo text not null,
  actor_id uuid references perfiles,
  motivo text,
  creado_en timestamptz not null default now()
);

create table acciones_procesadas (id uuid primary key, creado_en timestamptz not null default now());

create table posiciones (
  id bigint generated always as identity primary key,
  conductor_id uuid not null references perfiles on delete cascade,
  lat double precision not null, lng double precision not null,
  velocidad double precision, precision_m double precision,
  registrado_en timestamptz not null default now()
);
create index on posiciones (conductor_id, registrado_en desc);

create table posicion_actual (
  conductor_id uuid primary key references perfiles on delete cascade,
  lat double precision not null, lng double precision not null,
  velocidad double precision,
  en_servicio boolean not null default true,
  registrado_en timestamptz not null
);

create table tickets_combustible (
  id uuid primary key default gen_random_uuid(),
  conductor_id uuid not null references perfiles,
  vehiculo_id uuid not null references vehiculos,
  fecha date not null,
  gasolinera text,
  litros numeric(8,2) not null check (litros > 0),
  precio_litro numeric(6,3),
  importe numeric(8,2) not null check (importe > 0),
  tipo_combustible text,
  km int not null check (km >= 0),
  foto_path text,
  datos_ia jsonb,
  corregido boolean not null default false,
  creado_en timestamptz not null default now()
);

create table lugares_frecuentes (
  id serial primary key, nombre text not null, tipo text not null,
  lat double precision not null, lng double precision not null
);

create table ajustes (
  id int primary key default 1 check (id = 1),
  plazo_respuesta_min int not null default 15,
  umbral_sin_senal_min int not null default 5
);
insert into ajustes default values;

alter publication supabase_realtime add table servicios, eventos_servicio, posicion_actual;

insert into storage.buckets (id, name, public) values ('tickets','tickets', false);
```

- [ ] **Step 2: `0002_rls.sql`**

```sql
create or replace function es_operador() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from perfiles where id = auth.uid() and rol = 'operador') $$;

alter table vehiculos enable row level security;
alter table perfiles enable row level security;
alter table servicios enable row level security;
alter table eventos_servicio enable row level security;
alter table posiciones enable row level security;
alter table posicion_actual enable row level security;
alter table tickets_combustible enable row level security;
alter table lugares_frecuentes enable row level security;
alter table ajustes enable row level security;
alter table acciones_procesadas enable row level security;

-- Lectura: operador todo; conductor lo suyo. Escrituras de negocio: solo service role (Server Actions).
create policy leer_vehiculos on vehiculos for select to authenticated using (true);
create policy leer_perfiles on perfiles for select to authenticated using (es_operador() or id = auth.uid());
create policy leer_servicios on servicios for select to authenticated using (es_operador() or conductor_id = auth.uid());
create policy leer_eventos on eventos_servicio for select to authenticated
  using (es_operador() or exists (select 1 from servicios s where s.id = servicio_id and s.conductor_id = auth.uid()));
create policy leer_posicion_actual on posicion_actual for select to authenticated using (es_operador() or conductor_id = auth.uid());
create policy leer_posiciones on posiciones for select to authenticated using (es_operador() or conductor_id = auth.uid());
create policy leer_tickets on tickets_combustible for select to authenticated using (es_operador() or conductor_id = auth.uid());
create policy leer_lugares on lugares_frecuentes for select using (true);
create policy leer_ajustes on ajustes for select to authenticated using (true);

-- El conductor escribe su propia posición directamente (baja latencia).
create policy insertar_posicion on posiciones for insert to authenticated with check (conductor_id = auth.uid());

create policy leer_fotos_tickets on storage.objects for select to authenticated
  using (bucket_id = 'tickets' and (es_operador() or (storage.foldername(name))[1] = auth.uid()::text));
```

- [ ] **Step 3: `0003_funciones.sql`** (posición actual por trigger + expiración con pg_cron)

```sql
create or replace function actualizar_posicion_actual() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into posicion_actual (conductor_id, lat, lng, velocidad, en_servicio, registrado_en)
  values (new.conductor_id, new.lat, new.lng, new.velocidad, true, new.registrado_en)
  on conflict (conductor_id) do update
    set lat = excluded.lat, lng = excluded.lng, velocidad = excluded.velocidad,
        en_servicio = true, registrado_en = excluded.registrado_en;
  return new;
end $$;
create trigger trg_posicion after insert on posiciones for each row execute function actualizar_posicion_actual();

create or replace function expirar_asignaciones() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with vencidos as (
    update servicios
       set estado = 'pendiente', conductor_id = null, vehiculo_id = null, asignado_en = null,
           ultima_incidencia = 'expirado', incidencia_vista = false
     where estado = 'asignado' and asignado_en + make_interval(mins => plazo_respuesta_min) < now()
     returning id
  )
  insert into eventos_servicio (servicio_id, tipo, motivo)
  select id, 'expirado', 'Sin respuesta del conductor en el plazo' from vencidos;
  get diagnostics n = row_count;
  return n;
end $$;

select cron.schedule('expirar-asignaciones', '* * * * *', $$select public.expirar_asignaciones()$$);
```

- [ ] **Step 4: Aplicar y verificar**

Aplicar las tres migraciones (MCP `apply_migration`, nombres `esquema`, `rls`, `funciones`).
Verificar con SQL:
```sql
select count(*) from ajustes;                                    -- 1
select jobname from cron.job;                                    -- expirar-asignaciones
select public.expirar_asignaciones();                            -- 0
```
Y con MCP `get_advisors` (security): sin tablas sin RLS.

- [ ] **Step 5: Tipos TS** — `src/lib/dominio/tipos.ts`

```ts
export type Rol = "operador" | "conductor";
export type EstadoServicio =
  | "pendiente" | "asignado" | "aceptado" | "en_camino" | "recogido" | "completado" | "cancelado" | "subcontratado";
export type TipoVehiculo = "sedan" | "minivan" | "minivan_premium" | "microbus" | "minibus";
export interface Punto { lat: number; lng: number }

export interface Servicio {
  id: string;
  cliente_nombre: string; cliente_apellidos: string; cliente_email: string; cliente_telefono: string;
  origen_texto: string; origen_lat: number | null; origen_lng: number | null;
  destino_texto: string; destino_lat: number | null; destino_lng: number | null;
  fecha_hora_recogida: string; pasajeros: number; maletas: number;
  tipo_vehiculo_pedido: TipoVehiculo; numero_vuelo: string | null; notas: string | null;
  origen_pedido: "web" | "manual"; servicio_vuelta_id: string | null;
  conductor_id: string | null; vehiculo_id: string | null; estado: EstadoServicio;
  asignado_en: string | null; plazo_respuesta_min: number; duracion_estimada_min: number;
  subcontratar: boolean; ultima_incidencia: string | null; incidencia_vista: boolean; creado_en: string;
}
export interface Vehiculo { id: string; matricula: string; modelo: string; plazas: number; estado: "activo" | "taller"; km_actuales: number }
export interface Perfil { id: string; rol: Rol; nombre: string; telefono: string | null; vehiculo_habitual_id: string | null }
export interface PosicionActual { conductor_id: string; lat: number; lng: number; velocidad: number | null; en_servicio: boolean; registrado_en: string }
export interface TicketCombustible {
  id: string; conductor_id: string; vehiculo_id: string; fecha: string; gasolinera: string | null;
  litros: number; precio_litro: number | null; importe: number; tipo_combustible: string | null; km: number;
  foto_path: string | null; corregido: boolean; creado_en: string;
}
```

- [ ] **Step 6: Commit**

```bash
git add supabase src/lib/dominio/tipos.ts && git commit -m "Esquema de Supabase: tablas, RLS, expiración de asignaciones con pg_cron"
```

---

## Fase 1 · Lógica de dominio (TDD)

### Task 3: Máquina de estados del servicio

**Files:**
- Create: `src/lib/dominio/estados.ts`
- Test: `tests/unit/estados.test.ts`

**Interfaces:**
- Consumes: `EstadoServicio`, `Rol` de `tipos.ts`.
- Produces:
  ```ts
  type Accion = "asignar" | "reasignar" | "aceptar" | "rechazar" | "salir" | "cargar" | "descargar" | "cancelar" | "subcontratar";
  interface Actor { rol: Rol; esAsignado: boolean }
  type ResultadoTransicion = { ok: true; nuevo: EstadoServicio; evento: string } | { ok: false; error: string };
  function transicion(estado: EstadoServicio, accion: Accion, actor: Actor): ResultadoTransicion;
  const ACCION_SIGUIENTE_CONDUCTOR: Partial<Record<EstadoServicio, { accion: Accion; etiqueta: string }>>;
  const MOTIVOS_RECHAZO: readonly string[];
  ```

- [ ] **Step 1: Test que falla**

```ts
import { describe, expect, test } from "vitest";
import { transicion, ACCION_SIGUIENTE_CONDUCTOR } from "@/lib/dominio/estados";

const operador = { rol: "operador" as const, esAsignado: false };
const conductor = { rol: "conductor" as const, esAsignado: true };
const otroConductor = { rol: "conductor" as const, esAsignado: false };

describe("transicion", () => {
  test("flujo completo feliz", () => {
    expect(transicion("pendiente", "asignar", operador)).toEqual({ ok: true, nuevo: "asignado", evento: "asignado" });
    expect(transicion("asignado", "aceptar", conductor)).toMatchObject({ ok: true, nuevo: "aceptado" });
    expect(transicion("aceptado", "salir", conductor)).toMatchObject({ ok: true, nuevo: "en_camino" });
    expect(transicion("en_camino", "cargar", conductor)).toMatchObject({ ok: true, nuevo: "recogido" });
    expect(transicion("recogido", "descargar", conductor)).toMatchObject({ ok: true, nuevo: "completado" });
  });
  test("rechazar vuelve a pendiente", () => {
    expect(transicion("asignado", "rechazar", conductor)).toEqual({ ok: true, nuevo: "pendiente", evento: "rechazado" });
  });
  test("no se puede descargar sin cargar", () => {
    expect(transicion("en_camino", "descargar", conductor).ok).toBe(false);
  });
  test("un conductor no asignado no puede actuar", () => {
    const r = transicion("asignado", "aceptar", otroConductor);
    expect(r).toEqual({ ok: false, error: "Este servicio ya no está asignado a ti" });
  });
  test("un conductor no puede asignar ni cancelar", () => {
    expect(transicion("pendiente", "asignar", conductor).ok).toBe(false);
    expect(transicion("aceptado", "cancelar", conductor).ok).toBe(false);
  });
  test("operador cancela hasta aceptado, no después", () => {
    expect(transicion("aceptado", "cancelar", operador)).toMatchObject({ ok: true, nuevo: "cancelado" });
    expect(transicion("en_camino", "cancelar", operador).ok).toBe(false);
  });
  test("reasignar desde asignado o aceptado", () => {
    expect(transicion("aceptado", "reasignar", operador)).toMatchObject({ ok: true, nuevo: "asignado", evento: "reasignado" });
    expect(transicion("recogido", "reasignar", operador).ok).toBe(false);
  });
  test("subcontratar solo desde pendiente", () => {
    expect(transicion("pendiente", "subcontratar", operador)).toMatchObject({ ok: true, nuevo: "subcontratado" });
    expect(transicion("asignado", "subcontratar", operador).ok).toBe(false);
  });
  test("botón siguiente del conductor", () => {
    expect(ACCION_SIGUIENTE_CONDUCTOR.aceptado?.accion).toBe("salir");
    expect(ACCION_SIGUIENTE_CONDUCTOR.en_camino?.etiqueta).toMatch(/CARGA/);
    expect(ACCION_SIGUIENTE_CONDUCTOR.recogido?.etiqueta).toMatch(/DESCARGA/);
  });
});
```

- [ ] **Step 2: Ejecutar** `npm test -- estados` → FAIL (módulo no existe).

- [ ] **Step 3: Implementación**

```ts
import type { EstadoServicio, Rol } from "./tipos";

export type Accion = "asignar" | "reasignar" | "aceptar" | "rechazar" | "salir" | "cargar" | "descargar" | "cancelar" | "subcontratar";
export interface Actor { rol: Rol; esAsignado: boolean }
export type ResultadoTransicion = { ok: true; nuevo: EstadoServicio; evento: string } | { ok: false; error: string };

interface Regla { desde: EstadoServicio[]; hacia: EstadoServicio; quien: Rol; evento: string }

const REGLAS: Record<Accion, Regla> = {
  asignar:      { desde: ["pendiente"], hacia: "asignado", quien: "operador", evento: "asignado" },
  reasignar:    { desde: ["asignado", "aceptado"], hacia: "asignado", quien: "operador", evento: "reasignado" },
  cancelar:     { desde: ["pendiente", "asignado", "aceptado"], hacia: "cancelado", quien: "operador", evento: "cancelado" },
  subcontratar: { desde: ["pendiente"], hacia: "subcontratado", quien: "operador", evento: "subcontratado" },
  aceptar:      { desde: ["asignado"], hacia: "aceptado", quien: "conductor", evento: "aceptado" },
  rechazar:     { desde: ["asignado"], hacia: "pendiente", quien: "conductor", evento: "rechazado" },
  salir:        { desde: ["aceptado"], hacia: "en_camino", quien: "conductor", evento: "en_camino" },
  cargar:       { desde: ["en_camino"], hacia: "recogido", quien: "conductor", evento: "recogido" },
  descargar:    { desde: ["recogido"], hacia: "completado", quien: "conductor", evento: "completado" },
};

export function transicion(estado: EstadoServicio, accion: Accion, actor: Actor): ResultadoTransicion {
  const regla = REGLAS[accion];
  if (actor.rol !== regla.quien) return { ok: false, error: "No tienes permiso para esta acción" };
  if (actor.rol === "conductor" && !actor.esAsignado) return { ok: false, error: "Este servicio ya no está asignado a ti" };
  if (!regla.desde.includes(estado)) return { ok: false, error: `No se puede «${accion}» un servicio en estado «${estado}»` };
  return { ok: true, nuevo: regla.hacia, evento: regla.evento };
}

export const ACCION_SIGUIENTE_CONDUCTOR: Partial<Record<EstadoServicio, { accion: Accion; etiqueta: string }>> = {
  aceptado: { accion: "salir", etiqueta: "Salgo hacia la recogida" },
  en_camino: { accion: "cargar", etiqueta: "CARGA – pasajeros a bordo" },
  recogido: { accion: "descargar", etiqueta: "DESCARGA – servicio terminado" },
};

export const MOTIVOS_RECHAZO = ["Avería", "No llego a tiempo", "Fuera de servicio", "Otro"] as const;
```

- [ ] **Step 4: Ejecutar** `npm test -- estados` → PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "Máquina de estados del servicio con permisos por rol"`

### Task 4: Geografía y sugerencia de conductor

**Files:**
- Create: `src/lib/dominio/geo.ts`, `src/lib/dominio/sugerencia.ts`
- Test: `tests/unit/geo.test.ts`, `tests/unit/sugerencia.test.ts`

**Interfaces:**
- Consumes: `Punto` de `tipos.ts`.
- Produces:
  ```ts
  function distanciaKm(a: Punto, b: Punto): number;                // haversine
  function duracionEstimadaMin(a: Punto, b: Punto): number;        // ceil(dist*1.3/70*60) + 10, mínimo 15
  function diaMadrid(fechaIso: string | Date): string;             // "YYYY-MM-DD" en Europe/Madrid
  interface ServicioParaSugerir { id: string; inicio: Date; duracionMin: number; pasajeros: number; origen: Punto | null }
  interface TramoAgenda { servicioId: string; inicio: Date; fin: Date; destino: Punto | null }
  interface Candidato {
    conductorId: string; nombre: string;
    vehiculo: { id: string; plazas: number; estado: "activo" | "taller" } | null;
    posicion: { punto: Punto; registradoEn: Date } | null;
    agenda: TramoAgenda[];
  }
  interface Sugerencia { conductorId: string; nombre: string; apto: boolean; motivos: string[]; distanciaKm: number | null }
  function sugerirConductores(s: ServicioParaSugerir, candidatos: Candidato[], ahora: Date): Sugerencia[];
  ```
  Orden: aptos primero, luego por `distanciaKm` ascendente (null al final).

- [ ] **Step 1: Tests que fallan**

`tests/unit/geo.test.ts`:
```ts
import { expect, test } from "vitest";
import { distanciaKm, duracionEstimadaMin, diaMadrid } from "@/lib/dominio/geo";

const reusAeropuerto = { lat: 41.1474, lng: 1.1672 };
const salou = { lat: 41.0763, lng: 1.1416 };
const barcelonaAeropuerto = { lat: 41.2974, lng: 2.0833 };

test("distancia Reus aeropuerto – Salou ≈ 8 km", () => {
  expect(distanciaKm(reusAeropuerto, salou)).toBeGreaterThan(7);
  expect(distanciaKm(reusAeropuerto, salou)).toBeLessThan(9);
});
test("duración mínima 15 min y BCN–Salou alrededor de 1 h 20", () => {
  expect(duracionEstimadaMin(salou, salou)).toBe(15);
  const d = duracionEstimadaMin(barcelonaAeropuerto, salou);
  expect(d).toBeGreaterThan(70);
  expect(d).toBeLessThan(100);
});
test("diaMadrid: 23:30 UTC del 18 es el 19 en Madrid (verano CEST)", () => {
  expect(diaMadrid("2026-10-18T22:30:00Z")).toBe("2026-10-19");
  expect(diaMadrid("2026-10-18T21:59:00Z")).toBe("2026-10-18");
});
```

`tests/unit/sugerencia.test.ts`:
```ts
import { expect, test } from "vitest";
import { sugerirConductores, type Candidato } from "@/lib/dominio/sugerencia";

const salou = { lat: 41.0763, lng: 1.1416 };
const cambrils = { lat: 41.0670, lng: 1.0597 };
const tarragona = { lat: 41.1189, lng: 1.2445 };
const ahora = new Date("2026-10-15T08:00:00Z");
const servicio = { id: "s1", inicio: new Date("2026-10-15T08:30:00Z"), duracionMin: 40, pasajeros: 6, origen: salou };

const base = (id: string, extra: Partial<Candidato> = {}): Candidato => ({
  conductorId: id, nombre: id,
  vehiculo: { id: "v" + id, plazas: 8, estado: "activo" },
  posicion: null, agenda: [], ...extra,
});

test("descarta por plazas, taller y solape, con motivos", () => {
  const r = sugerirConductores(servicio, [
    base("pocas", { vehiculo: { id: "v", plazas: 4, estado: "activo" } }),
    base("taller", { vehiculo: { id: "v", plazas: 8, estado: "taller" } }),
    base("ocupado", { agenda: [{ servicioId: "x", inicio: new Date("2026-10-15T08:00:00Z"), fin: new Date("2026-10-15T09:00:00Z"), destino: null }] }),
    base("sinVehiculo", { vehiculo: null }),
  ], ahora);
  expect(r.every((s) => !s.apto)).toBe(true);
  expect(r.find((s) => s.conductorId === "pocas")!.motivos).toContain("Vehículo de 4 plazas (necesita 6)");
  expect(r.find((s) => s.conductorId === "taller")!.motivos).toContain("Vehículo en taller");
  expect(r.find((s) => s.conductorId === "ocupado")!.motivos).toContain("Ocupado a esa hora");
  expect(r.find((s) => s.conductorId === "sinVehiculo")!.motivos).toContain("Sin vehículo asignado");
});

test("servicio inminente: ordena por GPS reciente", () => {
  const r = sugerirConductores(servicio, [
    base("lejos", { posicion: { punto: tarragona, registradoEn: ahora } }),
    base("cerca", { posicion: { punto: cambrils, registradoEn: ahora } }),
  ], ahora);
  expect(r.map((s) => s.conductorId)).toEqual(["cerca", "lejos"]);
  expect(r[0].apto).toBe(true);
  expect(r[0].motivos[0]).toMatch(/^A \d+(\.\d)? km \(GPS\)$/);
});

test("servicio lejano: usa el destino del servicio anterior", () => {
  const tarde = { ...servicio, inicio: new Date("2026-10-15T15:00:00Z") };
  const r = sugerirConductores(tarde, [
    base("a", { agenda: [{ servicioId: "p", inicio: new Date("2026-10-15T12:00:00Z"), fin: new Date("2026-10-15T13:00:00Z"), destino: tarragona }] }),
    base("b", { agenda: [{ servicioId: "q", inicio: new Date("2026-10-15T12:00:00Z"), fin: new Date("2026-10-15T13:00:00Z"), destino: salou }] }),
  ], ahora);
  expect(r[0].conductorId).toBe("b");
  expect(r[0].motivos[0]).toMatch(/servicio anterior/);
});

test("GPS antiguo (>5 min) no cuenta como posición", () => {
  const r = sugerirConductores(servicio, [
    base("viejo", { posicion: { punto: salou, registradoEn: new Date("2026-10-15T07:00:00Z") } }),
  ], ahora);
  expect(r[0].distanciaKm).toBeNull();
});
```

- [ ] **Step 2: Ejecutar** `npm test -- geo sugerencia` → FAIL.

- [ ] **Step 3: Implementación**

`src/lib/dominio/geo.ts`:
```ts
import type { Punto } from "./tipos";

const R = 6371;
const rad = (g: number) => (g * Math.PI) / 180;

export function distanciaKm(a: Punto, b: Punto): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const FACTOR_CARRETERA = 1.3, VELOCIDAD_MEDIA_KMH = 70, MARGEN_MIN = 10;

export function duracionEstimadaMin(a: Punto, b: Punto): number {
  const min = Math.ceil(((distanciaKm(a, b) * FACTOR_CARRETERA) / VELOCIDAD_MEDIA_KMH) * 60) + MARGEN_MIN;
  return Math.max(15, min);
}

const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" });
export function diaMadrid(fecha: string | Date): string {
  return fmtDia.format(typeof fecha === "string" ? new Date(fecha) : fecha);
}
```

`src/lib/dominio/sugerencia.ts`:
```ts
import type { Punto } from "./tipos";
import { distanciaKm } from "./geo";

export interface ServicioParaSugerir { id: string; inicio: Date; duracionMin: number; pasajeros: number; origen: Punto | null }
export interface TramoAgenda { servicioId: string; inicio: Date; fin: Date; destino: Punto | null }
export interface Candidato {
  conductorId: string; nombre: string;
  vehiculo: { id: string; plazas: number; estado: "activo" | "taller" } | null;
  posicion: { punto: Punto; registradoEn: Date } | null;
  agenda: TramoAgenda[];
}
export interface Sugerencia { conductorId: string; nombre: string; apto: boolean; motivos: string[]; distanciaKm: number | null }

const MIN = 60_000;
const VENTANA_GPS_MIN = 60;
const GPS_VALIDO_MIN = 5;
const redondear = (km: number) => Math.round(km * 10) / 10;

export function sugerirConductores(s: ServicioParaSugerir, candidatos: Candidato[], ahora: Date): Sugerencia[] {
  const fin = new Date(s.inicio.getTime() + s.duracionMin * MIN);
  const inminente = s.inicio.getTime() - ahora.getTime() < VENTANA_GPS_MIN * MIN;

  const res = candidatos.map((c): Sugerencia => {
    const motivos: string[] = [];
    let apto = true;
    if (!c.vehiculo) { apto = false; motivos.push("Sin vehículo asignado"); }
    else {
      if (c.vehiculo.estado === "taller") { apto = false; motivos.push("Vehículo en taller"); }
      if (c.vehiculo.plazas < s.pasajeros) { apto = false; motivos.push(`Vehículo de ${c.vehiculo.plazas} plazas (necesita ${s.pasajeros})`); }
    }
    const otros = c.agenda.filter((t) => t.servicioId !== s.id);
    if (otros.some((t) => t.inicio < fin && s.inicio < t.fin)) { apto = false; motivos.push("Ocupado a esa hora"); }

    let distancia: number | null = null;
    const gpsValido = c.posicion && ahora.getTime() - c.posicion.registradoEn.getTime() <= GPS_VALIDO_MIN * MIN;
    if (s.origen && inminente && gpsValido) {
      distancia = redondear(distanciaKm(c.posicion!.punto, s.origen));
      motivos.unshift(`A ${distancia} km (GPS)`);
    } else if (s.origen) {
      const anterior = otros.filter((t) => t.fin <= s.inicio && t.destino).sort((a, b) => b.fin.getTime() - a.fin.getTime())[0];
      if (anterior) {
        distancia = redondear(distanciaKm(anterior.destino!, s.origen));
        motivos.unshift(`A ${distancia} km desde su servicio anterior`);
      }
    }
    if (apto) motivos.push("Libre a esa hora");
    return { conductorId: c.conductorId, nombre: c.nombre, apto, motivos, distanciaKm: distancia };
  });

  return res.sort((a, b) =>
    a.apto !== b.apto ? (a.apto ? -1 : 1) : (a.distanciaKm ?? Infinity) - (b.distanciaKm ?? Infinity));
}
```

- [ ] **Step 4: Ejecutar** `npm test` → PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "Distancias, duración estimada y sugerencia de conductor"`

### Task 5: Cálculos de combustible

**Files:**
- Create: `src/lib/dominio/combustible.ts`
- Test: `tests/unit/combustible.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface TicketCalculo { vehiculoId: string; fecha: string; litros: number; importe: number; km: number }
  function resumenCombustible(t: TicketCalculo[]): { gasto: number; litros: number; tickets: number };
  function consumoMedioL100(t: TicketCalculo[]): number | null;   // un solo vehículo; null si < 2 tickets o km no crecen
  function gastoPorMes(t: TicketCalculo[]): { mes: string; gasto: number; litros: number }[]; // mes "YYYY-MM", ordenado
  ```

- [ ] **Step 1: Test que falla**

```ts
import { expect, test } from "vitest";
import { consumoMedioL100, gastoPorMes, resumenCombustible } from "@/lib/dominio/combustible";

const t = (fecha: string, litros: number, importe: number, km: number) => ({ vehiculoId: "v1", fecha, litros, importe, km });

test("resumen suma gasto y litros con 2 decimales", () => {
  expect(resumenCombustible([t("2026-10-01", 40.5, 60.1, 1000), t("2026-10-05", 30.25, 45.333, 1500)]))
    .toEqual({ gasto: 105.43, litros: 70.75, tickets: 2 });
});
test("consumo: litros posteriores al primero / km recorridos", () => {
  // Tanque lleno en 1000 km; luego 35 L a los 1500 y 40 L a los 2000 → 75 L / 1000 km = 7.5
  expect(consumoMedioL100([t("2026-10-09", 40, 60, 2000), t("2026-10-01", 50, 75, 1000), t("2026-10-05", 35, 52, 1500)])).toBe(7.5);
});
test("consumo null con un ticket o km no crecientes", () => {
  expect(consumoMedioL100([t("2026-10-01", 40, 60, 1000)])).toBeNull();
  expect(consumoMedioL100([t("2026-10-01", 40, 60, 1000), t("2026-10-02", 40, 60, 1000)])).toBeNull();
});
test("gasto por mes ordenado", () => {
  expect(gastoPorMes([t("2026-10-02", 10, 15, 1), t("2026-09-30", 20, 30, 2), t("2026-10-20", 5, 7.5, 3)])).toEqual([
    { mes: "2026-09", gasto: 30, litros: 20 }, { mes: "2026-10", gasto: 22.5, litros: 15 },
  ]);
});
```

- [ ] **Step 2: Ejecutar** → FAIL.

- [ ] **Step 3: Implementación**

```ts
export interface TicketCalculo { vehiculoId: string; fecha: string; litros: number; importe: number; km: number }
const r2 = (n: number) => Math.round(n * 100) / 100;

export function resumenCombustible(t: TicketCalculo[]) {
  return { gasto: r2(t.reduce((a, x) => a + x.importe, 0)), litros: r2(t.reduce((a, x) => a + x.litros, 0)), tickets: t.length };
}

export function consumoMedioL100(t: TicketCalculo[]): number | null {
  if (t.length < 2) return null;
  const o = [...t].sort((a, b) => a.km - b.km);
  const km = o[o.length - 1].km - o[0].km;
  if (km <= 0) return null;
  const litros = o.slice(1).reduce((a, x) => a + x.litros, 0);
  return Math.round((litros / km) * 1000) / 10;
}

export function gastoPorMes(t: TicketCalculo[]) {
  const m = new Map<string, { gasto: number; litros: number }>();
  for (const x of t) {
    const k = x.fecha.slice(0, 7);
    const v = m.get(k) ?? { gasto: 0, litros: 0 };
    v.gasto += x.importe; v.litros += x.litros; m.set(k, v);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, v]) => ({ mes, gasto: r2(v.gasto), litros: r2(v.litros) }));
}
```

- [ ] **Step 4: Ejecutar** → PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "Cálculos de gasto y consumo de combustible"`

### Task 6: Lector de tickets (interfaz + Claude Haiku)

**Files:**
- Create: `src/lib/lector/tipos.ts`, `src/lib/lector/parsear.ts`, `src/lib/lector/claude.ts`, `src/lib/lector/index.ts`
- Test: `tests/unit/lector.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface DatosTicket { fecha: string | null; gasolinera: string | null; litros: number | null; precio_litro: number | null;
                          importe: number | null; tipo_combustible: string | null; confianza: "alta" | "media" | "baja" }
  interface ImagenTicket { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" }
  interface LectorTicket { leer(img: ImagenTicket): Promise<DatosTicket> }
  function parsearRespuesta(texto: string): DatosTicket;
  function esCoherente(d: DatosTicket): boolean;     // litros*precio ≈ importe (±2 % o ±0,10 €); true si falta algún dato
  class ClaudeHaikuLector implements LectorTicket { constructor(cliente?: Anthropic) }
  function obtenerLector(): LectorTicket;            // index.ts
  ```

Antes de escribir `claude.ts`, cargar la skill `claude-api` para confirmar la forma de las peticiones con imagen.

- [ ] **Step 1: Test que falla**

```ts
import { describe, expect, test, vi } from "vitest";
import { parsearRespuesta, esCoherente } from "@/lib/lector/parsear";
import { ClaudeHaikuLector } from "@/lib/lector/claude";

describe("parsearRespuesta", () => {
  test("JSON dentro de bloque de código, números con coma", () => {
    const d = parsearRespuesta('```json\n{"fecha":"2026-10-12","gasolinera":"Estación Demo","litros":"42,15","precio_litro":1.459,"importe":61.5,"tipo_combustible":"Diésel","confianza":"alta"}\n```');
    expect(d).toEqual({ fecha: "2026-10-12", gasolinera: "Estación Demo", litros: 42.15, precio_litro: 1.459, importe: 61.5, tipo_combustible: "Diésel", confianza: "alta" });
  });
  test("texto basura → todo null y confianza baja", () => {
    expect(parsearRespuesta("No puedo leer la imagen")).toEqual({
      fecha: null, gasolinera: null, litros: null, precio_litro: null, importe: null, tipo_combustible: null, confianza: "baja" });
  });
  test("fecha inválida se descarta", () => {
    expect(parsearRespuesta('{"fecha":"32/13/2026","litros":10,"importe":15,"confianza":"media"}').fecha).toBeNull();
  });
});

test("esCoherente", () => {
  const base = { fecha: null, gasolinera: null, tipo_combustible: null, confianza: "alta" as const };
  expect(esCoherente({ ...base, litros: 40, precio_litro: 1.5, importe: 60 })).toBe(true);
  expect(esCoherente({ ...base, litros: 40, precio_litro: 1.5, importe: 80 })).toBe(false);
  expect(esCoherente({ ...base, litros: 40, precio_litro: null, importe: 80 })).toBe(true);
});

test("ClaudeHaikuLector envía la imagen al modelo correcto y parsea", async () => {
  const create = vi.fn().mockResolvedValue({ content: [{ type: "text", text: '{"litros":10,"importe":15,"precio_litro":1.5,"confianza":"alta"}' }] });
  const lector = new ClaudeHaikuLector({ messages: { create } } as never);
  const d = await lector.leer({ base64: "AAAA", mediaType: "image/jpeg" });
  expect(d.litros).toBe(10);
  const args = create.mock.calls[0][0];
  expect(args.model).toBe("claude-haiku-5-5");
  expect(args.messages[0].content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } });
});
```

- [ ] **Step 2: Ejecutar** → FAIL.

- [ ] **Step 3: Implementación**

`src/lib/lector/tipos.ts`:
```ts
export interface DatosTicket {
  fecha: string | null; gasolinera: string | null; litros: number | null; precio_litro: number | null;
  importe: number | null; tipo_combustible: string | null; confianza: "alta" | "media" | "baja";
}
export interface ImagenTicket { base64: string; mediaType: "image/jpeg" | "image/png" | "image/webp" }
export interface LectorTicket { leer(img: ImagenTicket): Promise<DatosTicket> }
```

`src/lib/lector/parsear.ts`:
```ts
import { z } from "zod";
import type { DatosTicket } from "./tipos";

const num = z.preprocess((v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v), z.number().positive()).nullable().catch(null);
const texto = z.string().trim().min(1).nullable().catch(null);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s))).nullable().catch(null);

const Esquema = z.object({
  fecha: fecha.default(null), gasolinera: texto.default(null), litros: num.default(null), precio_litro: num.default(null),
  importe: num.default(null), tipo_combustible: texto.default(null),
  confianza: z.enum(["alta", "media", "baja"]).catch("baja").default("baja"),
});

const VACIO: DatosTicket = { fecha: null, gasolinera: null, litros: null, precio_litro: null, importe: null, tipo_combustible: null, confianza: "baja" };

export function parsearRespuesta(textoModelo: string): DatosTicket {
  const m = textoModelo.match(/\{[\s\S]*\}/);
  if (!m) return { ...VACIO };
  try { return Esquema.parse(JSON.parse(m[0])); } catch { return { ...VACIO }; }
}

export function esCoherente(d: DatosTicket): boolean {
  if (d.litros == null || d.precio_litro == null || d.importe == null) return true;
  const calc = d.litros * d.precio_litro;
  return Math.abs(calc - d.importe) <= Math.max(0.1, d.importe * 0.02);
}
```

`src/lib/lector/claude.ts`:
```ts
import Anthropic from "@anthropic-ai/sdk";
import { parsearRespuesta } from "./parsear";
import type { DatosTicket, ImagenTicket, LectorTicket } from "./tipos";

export const MODELO_LECTOR = "claude-haiku-5-5";

const INSTRUCCIONES = `Eres un lector de tickets de gasolinera españoles. Devuelve SOLO un objeto JSON con:
fecha (YYYY-MM-DD), gasolinera (nombre de la estación), litros (número), precio_litro (número, €/L),
importe (número, total en €), tipo_combustible (p. ej. "Diésel", "Gasolina 95"), confianza ("alta"|"media"|"baja").
Usa null en cualquier campo que no puedas leer con seguridad. No añadas texto fuera del JSON.`;

export class ClaudeHaikuLector implements LectorTicket {
  constructor(private cliente: Anthropic = new Anthropic()) {}
  async leer(img: ImagenTicket): Promise<DatosTicket> {
    const r = await this.cliente.messages.create({
      model: MODELO_LECTOR,
      max_tokens: 400,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } },
        { type: "text", text: INSTRUCCIONES },
      ] }],
    });
    const texto = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return parsearRespuesta(texto);
  }
}
```

`src/lib/lector/index.ts`:
```ts
import "server-only";
import { ClaudeHaikuLector } from "./claude";
import type { LectorTicket } from "./tipos";
// Punto único para cambiar de proveedor (OCR.space, Mindee…): devolver otra implementación de LectorTicket.
export function obtenerLector(): LectorTicket { return new ClaudeHaikuLector(); }
export * from "./tipos";
export { esCoherente } from "./parsear";
```

- [ ] **Step 4: Ejecutar** `npm test` → PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "Lector de tickets intercambiable con Claude Haiku 5.5"`

- [ ] **Step 6: Documentación del bloque** — entrada en `docs/DOCUMENTACION_TECNICA.md` → «Proceso iterativo»
  (fase 1: dominio con TDD) y commit.

---

## Fase 2 · Supabase, auth y acciones de servicio

### Task 7: Clientes de Supabase, login y protección por rol

**Files:**
- Create: `src/lib/supabase/servidor.ts`, `navegador.ts`, `admin.ts`, `sesion.ts`, `src/middleware.ts`,
  `src/app/login/page.tsx`, `src/app/login/actions.ts`
- Modify: `src/app/page.tsx` (portada con enlaces a Reservar / Acceso)

**Interfaces:**
- Produces:
  ```ts
  async function clienteServidor(): Promise<SupabaseClient>;   // servidor.ts, cookies de la sesión
  function clienteNavegador(): SupabaseClient;                 // navegador.ts, singleton
  function clienteAdmin(): SupabaseClient;                     // admin.ts, service role, "server-only"
  async function perfilActual(): Promise<Perfil | null>;       // sesion.ts
  async function exigirRol(rol: Rol): Promise<Perfil>;         // sesion.ts, redirige a /login si no cuadra
  ```

- [ ] **Step 1: Clientes**

`src/lib/supabase/servidor.ts`:
```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function clienteServidor() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (lista) => { try { lista.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* RSC */ } },
    },
  });
}
```

`src/lib/supabase/navegador.ts`:
```ts
"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
let c: SupabaseClient | null = null;
export function clienteNavegador() {
  return (c ??= createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!));
}
```

`src/lib/supabase/admin.ts`:
```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
export function clienteAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}
```

`src/lib/supabase/sesion.ts`:
```ts
import "server-only";
import { redirect } from "next/navigation";
import { clienteServidor } from "./servidor";
import type { Perfil, Rol } from "@/lib/dominio/tipos";

export async function perfilActual(): Promise<Perfil | null> {
  const sb = await clienteServidor();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("perfiles").select("*").eq("id", user.id).single();
  return data as Perfil | null;
}
export async function exigirRol(rol: Rol): Promise<Perfil> {
  const p = await perfilActual();
  if (!p || p.rol !== rol) redirect(`/login?destino=/${rol === "operador" ? "central" : "conductor"}`);
  return p;
}
```

- [ ] **Step 2: Middleware de refresco de sesión** — `src/middleware.ts`

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (lista) => {
        lista.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        lista.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user && /^\/(central|conductor)/.test(req.nextUrl.pathname)) {
    return NextResponse.redirect(new URL(`/login?destino=${req.nextUrl.pathname}`, req.url));
  }
  return res;
}
export const config = { matcher: ["/central/:path*", "/conductor/:path*"] };
```

- [ ] **Step 3: Login** — `src/app/login/actions.ts` + `page.tsx`

```ts
"use server";
import { redirect } from "next/navigation";
import { clienteServidor } from "@/lib/supabase/servidor";

export async function entrar(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const sb = await clienteServidor();
  const { data, error } = await sb.auth.signInWithPassword({ email: String(fd.get("email")), password: String(fd.get("password")) });
  if (error || !data.user) return { error: "Email o contraseña incorrectos" };
  const { data: p } = await sb.from("perfiles").select("rol").eq("id", data.user.id).single();
  redirect(p?.rol === "operador" ? "/central" : "/conductor");
}
export async function salir() { const sb = await clienteServidor(); await sb.auth.signOut(); redirect("/login"); }
```

`page.tsx`: formulario cliente con `useActionState(entrar, {})`, campos email/contraseña, mensaje de error, y un
recuadro «Cuentas de demo» que lista `central@transferdeluxe.test` y `conductor1..3@transferdeluxe.test` (la
contraseña de demo se muestra solo si `NEXT_PUBLIC_MODO_DEMO === "true"`, leída de `process.env.DEMO_PASSWORD` en el
servidor y pasada como prop).

- [ ] **Step 4: Verificar** — `npm run build` OK; tras el seed (Task 20) se probará el login real. Por ahora,
  `npm run dev` y abrir `/central` → redirige a `/login?destino=/central`.
- [ ] **Step 5: Commit** `git add -A && git commit -m "Clientes de Supabase, login y protección de /central y /conductor"`

### Task 8: Acciones de servicio en servidor (crear, asignar, transicionar) con idempotencia

**Files:**
- Create: `src/lib/servicios/acciones.ts`
- Test: `tests/unit/acciones.test.ts`

**Interfaces:**
- Consumes: `transicion` (Task 3), `duracionEstimadaMin` (Task 4), `clienteAdmin` (Task 7).
- Produces (funciones puras sobre un repositorio inyectable, para poder testear sin BD):
  ```ts
  interface RepoServicios {
    obtener(id: string): Promise<Servicio | null>;
    actualizar(id: string, cambios: Partial<Servicio>, estadoEsperado: EstadoServicio): Promise<boolean>; // false si otro lo cambió
    insertarEvento(e: { servicio_id: string; tipo: string; actor_id: string | null; motivo?: string | null }): Promise<void>;
    registrarAccion(idAccion: string): Promise<boolean>; // false si ya existía
    yaProcesada(idAccion: string): Promise<boolean>;
  }
  interface PeticionAccion { idAccion: string; servicioId: string; accion: Accion; actor: { id: string; rol: Rol };
                             motivo?: string; conductorId?: string; vehiculoId?: string }
  type ResultadoAccion = { ok: true; estado: EstadoServicio; duplicada?: boolean } | { ok: false; error: string };
  async function ejecutarAccion(repo: RepoServicios, p: PeticionAccion): Promise<ResultadoAccion>;
  function repoSupabase(): RepoServicios;   // implementación real con clienteAdmin
  ```
  Efectos por acción: `asignar|reasignar` → fija `conductor_id`, `vehiculo_id`, `asignado_en = now`,
  `incidencia_vista = true`; `rechazar` → limpia conductor/vehículo/asignado_en y `ultima_incidencia =
  'rechazado: <motivo>'`, `incidencia_vista = false`; `rechazar` sin motivo o con «Otro» sin texto → error.

- [ ] **Step 1: Test que falla** (repo en memoria)

```ts
import { beforeEach, expect, test } from "vitest";
import { ejecutarAccion, type RepoServicios } from "@/lib/servicios/acciones";
import type { Servicio } from "@/lib/dominio/tipos";

let db: Record<string, Servicio>; let eventos: { tipo: string; motivo?: string | null }[]; let acciones: Set<string>;
const repo: RepoServicios = {
  async obtener(id) { return db[id] ?? null; },
  async actualizar(id, c, esperado) { if (db[id].estado !== esperado) return false; db[id] = { ...db[id], ...c }; return true; },
  async insertarEvento(e) { eventos.push(e); },
  async registrarAccion(id) { if (acciones.has(id)) return false; acciones.add(id); return true; },
  async yaProcesada(id) { return acciones.has(id); },
};
const op = { id: "op", rol: "operador" as const };
const c1 = { id: "c1", rol: "conductor" as const };
const c2 = { id: "c2", rol: "conductor" as const };

beforeEach(() => {
  db = { s1: { id: "s1", estado: "pendiente", conductor_id: null } as Servicio };
  eventos = []; acciones = new Set();
});

test("asignar y aceptar", async () => {
  expect(await ejecutarAccion(repo, { idAccion: "a1", servicioId: "s1", accion: "asignar", actor: op, conductorId: "c1", vehiculoId: "v1" }))
    .toEqual({ ok: true, estado: "asignado" });
  expect(db.s1.conductor_id).toBe("c1");
  expect(await ejecutarAccion(repo, { idAccion: "a2", servicioId: "s1", accion: "aceptar", actor: c1 })).toEqual({ ok: true, estado: "aceptado" });
  expect(eventos.map((e) => e.tipo)).toEqual(["asignado", "aceptado"]);
});

test("misma idAccion dos veces no avanza dos veces", async () => {
  db.s1 = { ...db.s1, estado: "en_camino", conductor_id: "c1" };
  const p = { idAccion: "x", servicioId: "s1", accion: "cargar" as const, actor: c1 };
  expect(await ejecutarAccion(repo, p)).toEqual({ ok: true, estado: "recogido" });
  expect(await ejecutarAccion(repo, p)).toEqual({ ok: true, estado: "recogido", duplicada: true });
  expect(eventos).toHaveLength(1);
});

test("conductor que ya no es el asignado recibe error y no cambia nada", async () => {
  db.s1 = { ...db.s1, estado: "asignado", conductor_id: "c2" };
  const r = await ejecutarAccion(repo, { idAccion: "y", servicioId: "s1", accion: "aceptar", actor: c1 });
  expect(r).toEqual({ ok: false, error: "Este servicio ya no está asignado a ti" });
  expect(db.s1.estado).toBe("asignado");
});

test("rechazar exige motivo y deja incidencia para la central", async () => {
  db.s1 = { ...db.s1, estado: "asignado", conductor_id: "c1" };
  expect((await ejecutarAccion(repo, { idAccion: "r0", servicioId: "s1", accion: "rechazar", actor: c1 })).ok).toBe(false);
  expect((await ejecutarAccion(repo, { idAccion: "r1", servicioId: "s1", accion: "rechazar", actor: c1, motivo: "Otro" })).ok).toBe(false);
  expect(await ejecutarAccion(repo, { idAccion: "r2", servicioId: "s1", accion: "rechazar", actor: c1, motivo: "Avería" }))
    .toEqual({ ok: true, estado: "pendiente" });
  expect(db.s1).toMatchObject({ conductor_id: null, ultima_incidencia: "rechazado: Avería", incidencia_vista: false });
});

test("carrera: si el estado cambió entre leer y escribir, error", async () => {
  db.s1 = { ...db.s1, estado: "asignado", conductor_id: "c1" };
  const lento: RepoServicios = { ...repo, async actualizar() { return false; } };
  expect(await ejecutarAccion(lento, { idAccion: "z", servicioId: "s1", accion: "aceptar", actor: c1 }))
    .toEqual({ ok: false, error: "El servicio cambió mientras tanto; recarga" });
});

test("asignar sin conductor es error", async () => {
  expect((await ejecutarAccion(repo, { idAccion: "q", servicioId: "s1", accion: "asignar", actor: op })).ok).toBe(false);
});

void c2;
```

- [ ] **Step 2: Ejecutar** → FAIL.

- [ ] **Step 3: Implementación** — `src/lib/servicios/acciones.ts`

```ts
import { transicion, type Accion } from "@/lib/dominio/estados";
import type { EstadoServicio, Rol, Servicio } from "@/lib/dominio/tipos";

export interface RepoServicios {
  obtener(id: string): Promise<Servicio | null>;
  actualizar(id: string, cambios: Partial<Servicio>, estadoEsperado: EstadoServicio): Promise<boolean>;
  insertarEvento(e: { servicio_id: string; tipo: string; actor_id: string | null; motivo?: string | null }): Promise<void>;
  registrarAccion(idAccion: string): Promise<boolean>;
  yaProcesada(idAccion: string): Promise<boolean>;
}
export interface PeticionAccion {
  idAccion: string; servicioId: string; accion: Accion; actor: { id: string; rol: Rol };
  motivo?: string; conductorId?: string; vehiculoId?: string;
}
export type ResultadoAccion = { ok: true; estado: EstadoServicio; duplicada?: boolean } | { ok: false; error: string };

export async function ejecutarAccion(repo: RepoServicios, p: PeticionAccion): Promise<ResultadoAccion> {
  const s = await repo.obtener(p.servicioId);
  if (!s) return { ok: false, error: "Servicio no encontrado" };
  // Idempotencia primero: un reintento llega cuando el estado ya avanzó y la transición fallaría.
  if (await repo.yaProcesada(p.idAccion)) return { ok: true, estado: s.estado, duplicada: true };

  if ((p.accion === "asignar" || p.accion === "reasignar") && !p.conductorId) return { ok: false, error: "Elige un conductor" };
  if (p.accion === "rechazar" && (!p.motivo || p.motivo.trim() === "" || p.motivo === "Otro"))
    return { ok: false, error: "Indica el motivo del rechazo" };

  const t = transicion(s.estado, p.accion, { rol: p.actor.rol, esAsignado: s.conductor_id === p.actor.id });
  if (!t.ok) return t;
  if (!(await repo.registrarAccion(p.idAccion))) return { ok: true, estado: s.estado, duplicada: true };

  const cambios: Partial<Servicio> = { estado: t.nuevo };
  if (p.accion === "asignar" || p.accion === "reasignar") {
    Object.assign(cambios, { conductor_id: p.conductorId, vehiculo_id: p.vehiculoId ?? null, asignado_en: new Date().toISOString(), incidencia_vista: true });
  }
  if (p.accion === "rechazar") {
    Object.assign(cambios, { conductor_id: null, vehiculo_id: null, asignado_en: null, ultima_incidencia: `rechazado: ${p.motivo}`, incidencia_vista: false });
  }
  if (!(await repo.actualizar(s.id, cambios, s.estado))) return { ok: false, error: "El servicio cambió mientras tanto; recarga" };
  await repo.insertarEvento({ servicio_id: s.id, tipo: t.evento, actor_id: p.actor.id, motivo: p.motivo ?? null });
  return { ok: true, estado: t.nuevo };
}
```

`repoSupabase()` en el mismo fichero (sección server-only importada dinámicamente desde las Server Actions):
```ts
export function repoSupabase(sb: import("@supabase/supabase-js").SupabaseClient): RepoServicios {
  return {
    async obtener(id) { const { data } = await sb.from("servicios").select("*").eq("id", id).single(); return data as Servicio | null; },
    async actualizar(id, cambios, esperado) {
      const { data } = await sb.from("servicios").update(cambios).eq("id", id).eq("estado", esperado).select("id");
      return (data?.length ?? 0) > 0;
    },
    async insertarEvento(e) { await sb.from("eventos_servicio").insert(e); },
    async registrarAccion(id) { const { error } = await sb.from("acciones_procesadas").insert({ id }); return !error; },
    async yaProcesada(id) { const { data } = await sb.from("acciones_procesadas").select("id").eq("id", id).maybeSingle(); return !!data; },
  };
}
```

- [ ] **Step 4: Ejecutar** `npm test` → PASS (incluido el test de duplicado).
- [ ] **Step 5: Commit** `git add -A && git commit -m "Acciones de servicio validadas e idempotentes"`

---

## Fase 3 · Reserva pública

### Task 9: Esquema de reserva, geocodificación y página `/reservar`

**Files:**
- Create: `src/lib/reserva/esquema.ts`, `src/lib/limite.ts`, `src/app/api/geocodificar/route.ts`,
  `src/components/comun/CampoDireccion.tsx`, `src/app/reservar/page.tsx`, `src/app/reservar/FormularioReserva.tsx`,
  `src/app/reservar/actions.ts`
- Test: `tests/unit/reserva.test.ts`

**Interfaces:**
- Produces:
  ```ts
  const esquemaReserva: z.ZodType<Reserva>;   // valida el formulario (FormData → objeto)
  function serviciosDesdeReserva(r: Reserva, origen: "web" | "manual"): NuevoServicio[]; // 1 o 2 (ida + vuelta)
  async function crearServicios(sb: SupabaseClient, nuevos: NuevoServicio[]): Promise<string[]>; // enlaza vuelta
  function permitir(clave: string, max: number, ventanaMs: number): boolean;  // limite.ts, memoria
  ```
  `NuevoServicio` = columnas de `servicios` sin `id/estado/creado_en`, con `duracion_estimada_min` calculada y
  `subcontratar = pasajeros > 8`.

- [ ] **Step 1: Test que falla**

```ts
import { expect, test } from "vitest";
import { esquemaReserva, serviciosDesdeReserva } from "@/lib/reserva/esquema";

const base = {
  origen_texto: "Aeropuerto de Reus", origen_lat: "41.1474", origen_lng: "1.1672",
  destino_texto: "Salou centro", destino_lat: "41.0763", destino_lng: "1.1416",
  fecha: "2026-10-20", hora: "10:30", pasajeros: "4", maletas: "3", tipo_vehiculo_pedido: "minivan",
  numero_vuelo: "VY1234", cliente_nombre: "Lucía", cliente_apellidos: "Demo", cliente_email: "lucia@ejemplo.test",
  cliente_telefono: "600000001", notas: "", acepta_privacidad: "on", web: "",
};

test("reserva solo ida", () => {
  const r = esquemaReserva.parse(base);
  const s = serviciosDesdeReserva(r, "web");
  expect(s).toHaveLength(1);
  expect(s[0]).toMatchObject({ pasajeros: 4, origen_pedido: "web", subcontratar: false });
  expect(s[0].fecha_hora_recogida).toBe("2026-10-20T08:30:00.000Z"); // 10:30 Madrid (CEST)
  expect(s[0].duracion_estimada_min).toBeGreaterThanOrEqual(15);
});

test("con vuelta crea dos servicios; vuelta sin fecha es inválida", () => {
  const conVuelta = { ...base, con_vuelta: "on", vuelta_origen_texto: "Salou centro", vuelta_origen_lat: "41.0763", vuelta_origen_lng: "1.1416",
    vuelta_destino_texto: "Aeropuerto de Reus", vuelta_destino_lat: "41.1474", vuelta_destino_lng: "1.1672", vuelta_fecha: "2026-10-27", vuelta_hora: "18:00" };
  expect(serviciosDesdeReserva(esquemaReserva.parse(conVuelta), "web")).toHaveLength(2);
  expect(esquemaReserva.safeParse({ ...conVuelta, vuelta_fecha: "" }).success).toBe(false);
});

test("más de 8 pasajeros → subcontratar", () => {
  expect(serviciosDesdeReserva(esquemaReserva.parse({ ...base, pasajeros: "12" }), "web")[0].subcontratar).toBe(true);
});

test("sin privacidad o con campo trampa relleno → inválida", () => {
  expect(esquemaReserva.safeParse({ ...base, acepta_privacidad: undefined }).success).toBe(false);
  expect(esquemaReserva.safeParse({ ...base, web: "http://spam" }).success).toBe(false);
});
```

- [ ] **Step 2: Ejecutar** → FAIL.

- [ ] **Step 3: Implementación** — `src/lib/reserva/esquema.ts`

```ts
import { z } from "zod";
import { duracionEstimadaMin } from "@/lib/dominio/geo";
import type { Servicio } from "@/lib/dominio/tipos";

const coord = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().finite().nullable());
const opcional = z.preprocess((v) => (v === "" || v == null ? null : String(v).trim()), z.string().nullable());
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha obligatoria");
const hora = z.string().regex(/^\d{2}:\d{2}$/, "Hora obligatoria");

export const esquemaReserva = z.object({
  origen_texto: z.string().trim().min(3), origen_lat: coord, origen_lng: coord,
  destino_texto: z.string().trim().min(3), destino_lat: coord, destino_lng: coord,
  fecha, hora,
  pasajeros: z.coerce.number().int().min(1).max(19),
  maletas: z.coerce.number().int().min(0).max(19),
  tipo_vehiculo_pedido: z.enum(["sedan", "minivan", "minivan_premium", "microbus", "minibus"]),
  numero_vuelo: opcional,
  cliente_nombre: z.string().trim().min(1), cliente_apellidos: z.string().trim().default(""),
  cliente_email: z.string().trim().email(), cliente_telefono: z.string().trim().min(6),
  notas: opcional,
  acepta_privacidad: z.literal("on", { errorMap: () => ({ message: "Debes aceptar la política de privacidad" }) }),
  web: z.string().max(0).optional(),   // campo trampa: invisible, debe venir vacío
  con_vuelta: z.literal("on").optional(),
  vuelta_origen_texto: opcional, vuelta_origen_lat: coord.optional(), vuelta_origen_lng: coord.optional(),
  vuelta_destino_texto: opcional, vuelta_destino_lat: coord.optional(), vuelta_destino_lng: coord.optional(),
  vuelta_fecha: opcional, vuelta_hora: opcional, vuelta_numero_vuelo: opcional,
}).superRefine((r, ctx) => {
  if (!r.con_vuelta) return;
  for (const k of ["vuelta_origen_texto", "vuelta_destino_texto", "vuelta_fecha", "vuelta_hora"] as const)
    if (!r[k]) ctx.addIssue({ code: "custom", path: [k], message: "Obligatorio si hay vuelta" });
});
export type Reserva = z.infer<typeof esquemaReserva>;
export type NuevoServicio = Omit<Servicio, "id" | "estado" | "creado_en" | "servicio_vuelta_id" | "conductor_id" | "vehiculo_id" |
  "asignado_en" | "ultima_incidencia" | "incidencia_vista" | "plazo_respuesta_min">;

// Convierte fecha+hora locales de Madrid a ISO UTC.
export function madridAUtc(fecha: string, hora: string): string {
  const guess = new Date(`${fecha}T${hora}:00Z`);
  const enMadrid = new Date(guess.toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
  const offset = enMadrid.getTime() - new Date(guess.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(guess.getTime() - offset).toISOString();
}

function tramo(r: Reserva, origen: "web" | "manual", t: {
  o: string; olat: number | null; olng: number | null; d: string; dlat: number | null; dlng: number | null; fecha: string; hora: string; vuelo: string | null;
}): NuevoServicio {
  const dur = t.olat != null && t.olng != null && t.dlat != null && t.dlng != null
    ? duracionEstimadaMin({ lat: t.olat, lng: t.olng }, { lat: t.dlat, lng: t.dlng }) : 45;
  return {
    cliente_nombre: r.cliente_nombre, cliente_apellidos: r.cliente_apellidos, cliente_email: r.cliente_email, cliente_telefono: r.cliente_telefono,
    origen_texto: t.o, origen_lat: t.olat, origen_lng: t.olng, destino_texto: t.d, destino_lat: t.dlat, destino_lng: t.dlng,
    fecha_hora_recogida: madridAUtc(t.fecha, t.hora), pasajeros: r.pasajeros, maletas: r.maletas,
    tipo_vehiculo_pedido: r.tipo_vehiculo_pedido, numero_vuelo: t.vuelo, notas: r.notas, origen_pedido: origen,
    duracion_estimada_min: dur, subcontratar: r.pasajeros > 8,
  };
}

export function serviciosDesdeReserva(r: Reserva, origen: "web" | "manual"): NuevoServicio[] {
  const ida = tramo(r, origen, { o: r.origen_texto, olat: r.origen_lat, olng: r.origen_lng, d: r.destino_texto, dlat: r.destino_lat, dlng: r.destino_lng, fecha: r.fecha, hora: r.hora, vuelo: r.numero_vuelo });
  if (!r.con_vuelta) return [ida];
  const vuelta = tramo(r, origen, { o: r.vuelta_origen_texto!, olat: r.vuelta_origen_lat ?? null, olng: r.vuelta_origen_lng ?? null,
    d: r.vuelta_destino_texto!, dlat: r.vuelta_destino_lat ?? null, dlng: r.vuelta_destino_lng ?? null, fecha: r.vuelta_fecha!, hora: r.vuelta_hora!, vuelo: r.vuelta_numero_vuelo });
  return [ida, vuelta];
}

export async function crearServicios(sb: import("@supabase/supabase-js").SupabaseClient, nuevos: NuevoServicio[]): Promise<string[]> {
  const { data: aj } = await sb.from("ajustes").select("plazo_respuesta_min").single();
  const { data, error } = await sb.from("servicios")
    .insert(nuevos.map((n) => ({ ...n, plazo_respuesta_min: aj?.plazo_respuesta_min ?? 15, incidencia_vista: false, ultima_incidencia: "nuevo" })))
    .select("id");
  if (error || !data) throw new Error(error?.message ?? "No se pudo crear");
  const ids = data.map((d) => d.id as string);
  if (ids.length === 2) {
    await sb.from("servicios").update({ servicio_vuelta_id: ids[1] }).eq("id", ids[0]);
    await sb.from("servicios").update({ servicio_vuelta_id: ids[0] }).eq("id", ids[1]);
  }
  await sb.from("eventos_servicio").insert(ids.map((id) => ({ servicio_id: id, tipo: "creado" })));
  return ids;
}
```
(`ultima_incidencia = 'nuevo'` + `incidencia_vista = false` es lo que hace aparecer la alerta «reserva nueva»).

`src/lib/limite.ts`:
```ts
const golpes = new Map<string, number[]>();
export function permitir(clave: string, max: number, ventanaMs: number): boolean {
  const ahora = Date.now();
  const lista = (golpes.get(clave) ?? []).filter((t) => ahora - t < ventanaMs);
  if (lista.length >= max) { golpes.set(clave, lista); return false; }
  lista.push(ahora); golpes.set(clave, lista); return true;
}
```

- [ ] **Step 4: Ejecutar** `npm test` → PASS.

- [ ] **Step 5: Geocodificación** — `src/app/api/geocodificar/route.ts`

```ts
import { NextResponse } from "next/server";
import { clienteAdmin } from "@/lib/supabase/admin";
import { permitir } from "@/lib/limite";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return NextResponse.json([]);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  const { data: lugares } = await clienteAdmin().from("lugares_frecuentes").select("nombre, lat, lng").ilike("nombre", `%${q}%`).limit(5);
  const frecuentes = (lugares ?? []).map((l) => ({ etiqueta: l.nombre, lat: l.lat, lng: l.lng, frecuente: true }));
  if (!permitir(`geo:${ip}`, 30, 60_000)) return NextResponse.json(frecuentes);
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=es&viewbox=0.15,42.9,3.35,40.5&bounded=1&q=${encodeURIComponent(q)}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "TransferdeLuxe-demo/1.0 (hackathon)", "Accept-Language": "es" }, next: { revalidate: 86400 } });
    const osm = (await r.json()) as { display_name: string; lat: string; lon: string }[];
    return NextResponse.json([...frecuentes, ...osm.map((o) => ({ etiqueta: o.display_name, lat: Number(o.lat), lng: Number(o.lon), frecuente: false }))]);
  } catch { return NextResponse.json(frecuentes); }
}
```

- [ ] **Step 6: `CampoDireccion`** (cliente): input de texto con debounce 500 ms que llama a `/api/geocodificar`,
  lista desplegable de resultados (los frecuentes con ⭐), y al elegir rellena tres inputs ocultos
  `${name}_texto`, `${name}_lat`, `${name}_lng`. Si el usuario escribe sin elegir, lat/lng quedan vacíos (válido).
  Props: `{ name: string; etiqueta: string; requerido?: boolean; valorInicial?: string }`.

- [ ] **Step 7: Acción y página**

`src/app/reservar/actions.ts`:
```ts
"use server";
import { headers } from "next/headers";
import { esquemaReserva, serviciosDesdeReserva, crearServicios } from "@/lib/reserva/esquema";
import { clienteAdmin } from "@/lib/supabase/admin";
import { permitir } from "@/lib/limite";

export type EstadoReserva = { ok?: boolean; errores?: Record<string, string[]>; mensaje?: string };

export async function reservar(_: EstadoReserva, fd: FormData): Promise<EstadoReserva> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!permitir(`reserva:${ip}`, 5, 3_600_000)) return { mensaje: "Demasiadas reservas desde esta conexión. Inténtalo más tarde." };
  const r = esquemaReserva.safeParse(Object.fromEntries(fd));
  if (!r.success) return { errores: r.error.flatten().fieldErrors as Record<string, string[]>, mensaje: "Revisa los campos marcados" };
  await crearServicios(clienteAdmin(), serviciosDesdeReserva(r.data, "web"));
  return { ok: true, mensaje: "¡Reserva recibida! Te confirmaremos el traslado en breve." };
}
```

`FormularioReserva.tsx` (cliente, `useActionState(reservar, {})`): secciones «Trayecto» (2 × `CampoDireccion`,
fecha, hora, selects pasajeros 1–19 y maletas 0–19, tipo de vehículo con etiquetas «Sedán (3 pax)», «MiniVan (7
pax)», «MiniVan Premium (8 pax)», «MicroBus (13 pax)», «MiniBus (19 pax)», nº de vuelo), checkbox «Añadir vuelta»
que despliega la sección «Vuelta», «Tus datos» (nombre, apellidos, email, teléfono, información adicional),
checkbox de privacidad, input trampa `name="web"` oculto con `className="hidden" tabIndex={-1} autoComplete="off"`,
botón «Reservar». Errores por campo bajo cada input. En éxito muestra la tarjeta de confirmación.
`page.tsx`: cabecera con la marca TransferdeLuxe (ficticia) y el formulario.

- [ ] **Step 8: Verificar en navegador** — `npm run dev`, abrir `/reservar`, enviar una reserva con vuelta; en
  Supabase `select count(*) from servicios` = 2 y ambos con `servicio_vuelta_id` cruzado.
- [ ] **Step 9: Commit** `git add -A && git commit -m "Reserva pública con ida/vuelta, geocodificación y anti-spam"`

---

## Fase 4 · Centro de control

### Task 10: Layout de la central, listado y ficha de servicio, alta manual

**Files:**
- Create: `src/app/central/layout.tsx`, `src/app/central/servicios/page.tsx`, `src/app/central/servicios/[id]/page.tsx`,
  `src/app/central/servicios/nuevo/page.tsx`, `src/app/central/actions.ts`, `src/components/central/TablaServicios.tsx`,
  `src/components/comun/EstadoBadge.tsx`, `src/components/mapa/MapaTrayecto.tsx`

**Interfaces:**
- Consumes: `exigirRol`, `ejecutarAccion`, `repoSupabase`, `clienteAdmin`, `esquemaReserva`, `crearServicios`.
- Produces (Server Actions en `central/actions.ts`, todas llaman a `exigirRol("operador")` primero):
  ```ts
  async function accionCentral(p: { idAccion: string; servicioId: string; accion: "asignar" | "reasignar" | "cancelar" | "subcontratar";
                                    conductorId?: string; vehiculoId?: string }): Promise<ResultadoAccion>;
  async function crearServicioManual(_: EstadoReserva, fd: FormData): Promise<EstadoReserva>; // origen "manual", acepta_privacidad implícito
  async function marcarIncidenciaVista(servicioId: string): Promise<void>;
  ```

- [ ] **Step 1: `EstadoBadge`** — mapa estado → etiqueta y color Tailwind:
  pendiente «Pendiente» ámbar · asignado «Esperando respuesta» azul claro · aceptado «Aceptado» azul ·
  en_camino «En camino» violeta · recogido «Con pasajeros» índigo · completado «Completado» verde ·
  cancelado «Cancelado» gris · subcontratado «Subcontratado» naranja.

- [ ] **Step 2: Layout** — `central/layout.tsx`: `await exigirRol("operador")`; barra lateral con enlaces Panel,
  Servicios, Hoja de ruta, Combustible, Flota; nombre del operador y botón «Salir» (`salir`).

- [ ] **Step 3: Server Actions** — `central/actions.ts`

```ts
"use server";
import { revalidatePath } from "next/cache";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { ejecutarAccion, repoSupabase, type ResultadoAccion } from "@/lib/servicios/acciones";
import { esquemaReserva, serviciosDesdeReserva, crearServicios } from "@/lib/reserva/esquema";
import type { EstadoReserva } from "@/app/reservar/actions";

export async function accionCentral(p: { idAccion: string; servicioId: string; accion: "asignar" | "reasignar" | "cancelar" | "subcontratar"; conductorId?: string; vehiculoId?: string }): Promise<ResultadoAccion> {
  const yo = await exigirRol("operador");
  const r = await ejecutarAccion(repoSupabase(clienteAdmin()), { ...p, actor: { id: yo.id, rol: "operador" } });
  revalidatePath("/central", "layout");
  return r;
}

export async function crearServicioManual(_: EstadoReserva, fd: FormData): Promise<EstadoReserva> {
  await exigirRol("operador");
  fd.set("acepta_privacidad", "on");
  const r = esquemaReserva.safeParse(Object.fromEntries(fd));
  if (!r.success) return { errores: r.error.flatten().fieldErrors as Record<string, string[]>, mensaje: "Revisa los campos marcados" };
  const ids = await crearServicios(clienteAdmin(), serviciosDesdeReserva(r.data, "manual"));
  revalidatePath("/central", "layout");
  return { ok: true, mensaje: `Servicio creado (${ids.length})` };
}

export async function marcarIncidenciaVista(servicioId: string) {
  await exigirRol("operador");
  await clienteAdmin().from("servicios").update({ incidencia_vista: true }).eq("id", servicioId);
  revalidatePath("/central", "layout");
}
```

- [ ] **Step 4: Listado** — `servicios/page.tsx` (server): filtros por querystring `fecha` (por defecto hoy en
  Madrid), `estado`, `conductor`, `origen`; consulta con el cliente de servidor (RLS operador);
  `TablaServicios` muestra hora (Madrid), trayecto, pax/maletas, cliente, conductor, `EstadoBadge`, icono rojo si
  `ultima_incidencia` empieza por `rechazado`/`expirado`, y enlace a la ficha. Botón «Nuevo servicio».

- [ ] **Step 5: Alta manual** — `servicios/nuevo/page.tsx`: reutiliza `FormularioReserva` con prop
  `accion={crearServicioManual}` y `modo="central"` (oculta privacidad y el campo trampa). Modificar
  `FormularioReserva` para aceptar esas props (por defecto `reservar` y `modo="publico"`).

- [ ] **Step 6: Ficha** — `servicios/[id]/page.tsx`: datos del cliente y trayecto, `MapaTrayecto` (Leaflet,
  `dynamic(..., { ssr: false })`, dos marcadores y una línea), historial de `eventos_servicio` (hora, tipo, actor,
  motivo), botones según estado: «Asignar» (abre `DialogoAsignar`, Task 11), «Cancelar», «Subcontratar»; si
  `servicio_vuelta_id` enlace «Ver vuelta/ida». Al abrir una ficha con incidencia no vista, llamar a
  `marcarIncidenciaVista`.

  `MapaTrayecto.tsx`:
```tsx
"use client";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip } from "react-leaflet";
import type { Punto } from "@/lib/dominio/tipos";

export default function MapaTrayecto({ origen, destino }: { origen: Punto | null; destino: Punto | null }) {
  const centro = origen ?? destino ?? { lat: 41.0763, lng: 1.1416 };
  return (
    <MapContainer center={[centro.lat, centro.lng]} zoom={11} className="h-64 w-full rounded-lg">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
      {origen && <CircleMarker center={[origen.lat, origen.lng]} radius={8} pathOptions={{ color: "#16a34a" }}><Tooltip>Recogida</Tooltip></CircleMarker>}
      {destino && <CircleMarker center={[destino.lat, destino.lng]} radius={8} pathOptions={{ color: "#dc2626" }}><Tooltip>Destino</Tooltip></CircleMarker>}
      {origen && destino && <Polyline positions={[[origen.lat, origen.lng], [destino.lat, destino.lng]]} pathOptions={{ dashArray: "6" }} />}
    </MapContainer>
  );
}
```

- [ ] **Step 7: Verificar** — con el seed (o datos de la Task 9) entrar como operador, ver listado, crear un servicio
  manual y abrir su ficha.
- [ ] **Step 8: Commit** `git add -A && git commit -m "Central: listado, ficha y alta manual de servicios"`

### Task 11: Asignar con sugerencia

**Files:**
- Create: `src/components/central/DialogoAsignar.tsx`
- Modify: `src/app/central/actions.ts` (añadir `obtenerSugerencias`)

**Interfaces:**
- Consumes: `sugerirConductores`, `Candidato`, `accionCentral`.
- Produces:
  ```ts
  async function obtenerSugerencias(servicioId: string): Promise<(Sugerencia & { vehiculoId: string | null; matricula: string | null })[]>;
  function DialogoAsignar(props: { servicioId: string; reasignar?: boolean; onHecho?: () => void }): JSX.Element;
  ```

- [ ] **Step 1: `obtenerSugerencias`** (en `central/actions.ts`)

```ts
import { sugerirConductores, type Candidato } from "@/lib/dominio/sugerencia";

export async function obtenerSugerencias(servicioId: string) {
  await exigirRol("operador");
  const sb = clienteAdmin();
  const { data: s } = await sb.from("servicios").select("*").eq("id", servicioId).single();
  if (!s) return [];
  const inicio = new Date(s.fecha_hora_recogida);
  const desde = new Date(inicio.getTime() - 12 * 3600_000).toISOString();
  const hasta = new Date(inicio.getTime() + 12 * 3600_000).toISOString();
  const [{ data: conductores }, { data: vehiculos }, { data: posiciones }, { data: agenda }] = await Promise.all([
    sb.from("perfiles").select("id, nombre, vehiculo_habitual_id").eq("rol", "conductor"),
    sb.from("vehiculos").select("*"),
    sb.from("posicion_actual").select("*"),
    sb.from("servicios").select("id, conductor_id, fecha_hora_recogida, duracion_estimada_min, destino_lat, destino_lng")
      .in("estado", ["asignado", "aceptado", "en_camino", "recogido"]).gte("fecha_hora_recogida", desde).lte("fecha_hora_recogida", hasta),
  ]);
  const candidatos: Candidato[] = (conductores ?? []).map((c) => {
    const v = vehiculos?.find((x) => x.id === c.vehiculo_habitual_id) ?? null;
    const p = posiciones?.find((x) => x.conductor_id === c.id && x.en_servicio);
    return {
      conductorId: c.id, nombre: c.nombre,
      vehiculo: v ? { id: v.id, plazas: v.plazas, estado: v.estado } : null,
      posicion: p ? { punto: { lat: p.lat, lng: p.lng }, registradoEn: new Date(p.registrado_en) } : null,
      agenda: (agenda ?? []).filter((a) => a.conductor_id === c.id).map((a) => {
        const i = new Date(a.fecha_hora_recogida);
        return { servicioId: a.id, inicio: i, fin: new Date(i.getTime() + a.duracion_estimada_min * 60_000),
          destino: a.destino_lat != null ? { lat: a.destino_lat, lng: a.destino_lng } : null };
      }),
    };
  });
  const origen = s.origen_lat != null ? { lat: s.origen_lat, lng: s.origen_lng } : null;
  return sugerirConductores({ id: s.id, inicio, duracionMin: s.duracion_estimada_min, pasajeros: s.pasajeros, origen }, candidatos, new Date())
    .map((sg) => {
      const v = vehiculos?.find((x) => x.id === conductores?.find((c) => c.id === sg.conductorId)?.vehiculo_habitual_id);
      return { ...sg, vehiculoId: v?.id ?? null, matricula: v?.matricula ?? null };
    });
}
```

- [ ] **Step 2: `DialogoAsignar`** (cliente): al abrir llama a `obtenerSugerencias`; lista una tarjeta por conductor
  con nombre, matrícula, chips de motivos (verde si apto, gris/rojo si no) y botón «Asignar» (deshabilitado si no
  apto, con opción «Asignar igualmente» tras confirmar). Al pulsar: `accionCentral({ idAccion: crypto.randomUUID(),
  servicioId, accion: reasignar ? "reasignar" : "asignar", conductorId, vehiculoId })`; muestra error si `!ok`.
  La primera tarjeta apta lleva la etiqueta «Recomendado».

- [ ] **Step 3: Verificar** — con datos de demo: un servicio de 6 pax a las 10:00 → los conductores con solape
  aparecen como «Ocupado a esa hora»; asignar → estado «Esperando respuesta».
- [ ] **Step 4: Commit** `git add -A && git commit -m "Central: asignación con sugerencia de conductor"`

### Task 12: Panel en vivo (mapa en tiempo real, alertas, contadores)

**Files:**
- Create: `src/app/central/page.tsx`, `src/components/mapa/MapaFlota.tsx`, `src/components/central/ColumnaAlertas.tsx`,
  `src/components/central/Contadores.tsx`, `src/lib/supabase/useTiempoReal.ts`

**Interfaces:**
- Produces:
  ```ts
  function useTiempoReal<T extends { [k: string]: unknown }>(tabla: "servicios" | "posicion_actual" | "eventos_servicio",
    iniciales: T[], clave: keyof T): T[];   // aplica INSERT/UPDATE/DELETE de postgres_changes
  type EstadoVehiculoMapa = "libre" | "en_camino" | "con_pasajeros" | "sin_senal";
  function estadoEnMapa(pos: PosicionActual | undefined, servicioActivo: Servicio | undefined, ahora: Date, umbralMin: number): EstadoVehiculoMapa;
  ```
  `estadoEnMapa` va en `src/lib/dominio/mapa.ts` con test en `tests/unit/mapa.test.ts`.

- [ ] **Step 1: Test que falla** — `tests/unit/mapa.test.ts`

```ts
import { expect, test } from "vitest";
import { estadoEnMapa } from "@/lib/dominio/mapa";

const ahora = new Date("2026-10-15T10:00:00Z");
const pos = (min: number, en_servicio = true) => ({ conductor_id: "c", lat: 0, lng: 0, velocidad: 0, en_servicio, registrado_en: new Date(ahora.getTime() - min * 60_000).toISOString() });

test("estados en el mapa", () => {
  expect(estadoEnMapa(undefined, undefined, ahora, 5)).toBe("sin_senal");
  expect(estadoEnMapa(pos(6), undefined, ahora, 5)).toBe("sin_senal");
  expect(estadoEnMapa(pos(1, false), undefined, ahora, 5)).toBe("sin_senal");
  expect(estadoEnMapa(pos(1), undefined, ahora, 5)).toBe("libre");
  expect(estadoEnMapa(pos(1), { estado: "en_camino" } as never, ahora, 5)).toBe("en_camino");
  expect(estadoEnMapa(pos(1), { estado: "recogido" } as never, ahora, 5)).toBe("con_pasajeros");
});
```

- [ ] **Step 2: Ejecutar** → FAIL. **Step 3: Implementación** `src/lib/dominio/mapa.ts`:

```ts
import type { PosicionActual, Servicio } from "./tipos";
export type EstadoVehiculoMapa = "libre" | "en_camino" | "con_pasajeros" | "sin_senal";
export function estadoEnMapa(pos: PosicionActual | undefined, activo: Pick<Servicio, "estado"> | undefined, ahora: Date, umbralMin: number): EstadoVehiculoMapa {
  if (!pos || !pos.en_servicio || ahora.getTime() - new Date(pos.registrado_en).getTime() > umbralMin * 60_000) return "sin_senal";
  if (activo?.estado === "recogido") return "con_pasajeros";
  if (activo?.estado === "en_camino") return "en_camino";
  return "libre";
}
```
Ejecutar → PASS.

- [ ] **Step 4: Hook de tiempo real** — `src/lib/supabase/useTiempoReal.ts`

```ts
"use client";
import { useEffect, useState } from "react";
import { clienteNavegador } from "./navegador";

export function useTiempoReal<T extends Record<string, unknown>>(tabla: string, iniciales: T[], clave: keyof T): T[] {
  const [filas, setFilas] = useState(iniciales);
  useEffect(() => setFilas(iniciales), [iniciales]);
  useEffect(() => {
    const canal = clienteNavegador().channel(`rt-${tabla}`)
      .on("postgres_changes", { event: "*", schema: "public", table: tabla }, (p) => {
        setFilas((act) => {
          if (p.eventType === "DELETE") return act.filter((f) => f[clave] !== (p.old as T)[clave]);
          const nueva = p.new as T;
          const i = act.findIndex((f) => f[clave] === nueva[clave]);
          return i === -1 ? [...act, nueva] : act.map((f, j) => (j === i ? nueva : f));
        });
      }).subscribe();
    return () => { clienteNavegador().removeChannel(canal); };
  }, [tabla, clave]);
  return filas;
}
```

- [ ] **Step 5: `MapaFlota`** (cliente, `ssr:false`): centrado en Salou zoom 11; un `Marker` con `divIcon` por
  conductor: círculo de color (libre verde `#16a34a`, en_camino violeta `#7c3aed`, con_pasajeros índigo `#4338ca`,
  sin_senal gris `#9ca3af`) con la inicial; `Popup` con nombre, matrícula, estado, servicio actual y siguiente, y
  «hace X min». Recalcula `ahora` cada 30 s para pasar a «sin señal».

- [ ] **Step 6: `ColumnaAlertas`**: servicios con `incidencia_vista = false` o (`subcontratar` y estado
  `pendiente`), ordenados por fecha. Tipos: «Reserva nueva» (`ultima_incidencia = 'nuevo'`), «Rechazado por X:
  motivo» (busca último evento `rechazado` para el nombre), «Sin respuesta (plazo vencido)», «Subcontratar (N pax)».
  Acciones: «Asignar» (abre `DialogoAsignar`), «Subcontratar», «Visto». Reproducir un sonido corto
  (`new Audio("/aviso.mp3")`) cuando entra una alerta nueva por Realtime.

- [ ] **Step 7: `Contadores`** — del día (Madrid): pendientes, esperando respuesta, en curso (aceptado/en_camino/
  recogido), completados.

- [ ] **Step 8: `central/page.tsx`** (server): carga servicios de hoy y mañana, `posicion_actual`, perfiles,
  vehículos y `ajustes`; pasa todo a un componente cliente `PanelEnVivo` que usa `useTiempoReal` para
  `servicios` (clave `id`) y `posicion_actual` (clave `conductor_id`) y compone: contadores arriba, mapa a la
  izquierda (2/3), alertas a la derecha (1/3).

- [ ] **Step 9: Verificar** — dos ventanas: operador en `/central` y SQL `insert into posiciones (...)` para un
  conductor → el marcador se mueve sin recargar; `update servicios set incidencia_vista=false, ultima_incidencia='expirado'`
  → aparece la alerta.
- [ ] **Step 10: Commit** `git add -A && git commit -m "Central: panel en vivo con mapa, alertas y contadores en tiempo real"`

### Task 13: Hoja de ruta por conductor (arrastrar para reasignar)

**Files:**
- Create: `src/app/central/ruta/page.tsx`, `src/components/central/TableroRuta.tsx`

**Interfaces:**
- Consumes: `accionCentral` (`reasignar` / `asignar`), `diaMadrid`.

- [ ] **Step 1: Página** — querystring `dia` (por defecto hoy Madrid; botones ◀ ▶). Carga servicios de ese día
  (no cancelados) y conductores. Columnas: «Sin asignar» + una por conductor. Tarjeta: hora, origen → destino, pax,
  `EstadoBadge`.
- [ ] **Step 2: Arrastrar** — `@dnd-kit/core` (`DndContext`, `useDraggable`, `useDroppable`). Solo arrastrables
  tarjetas en `pendiente`, `asignado` o `aceptado`. Al soltar en otra columna de conductor: `accionCentral` con
  `asignar` (si estaba pendiente) o `reasignar`, `vehiculoId` = vehículo habitual del conductor; soltar en «Sin
  asignar» no está permitido (mostrar aviso: para quitar el conductor, cancelar o esperar rechazo). Mostrar toast de
  error si `!ok` y revertir.
- [ ] **Step 3: Verificar** — arrastrar un servicio de conductor 1 a conductor 2 → estado «Esperando respuesta» y
  el conductor 2 lo recibe (se verá en Task 16).
- [ ] **Step 4: Commit** `git add -A && git commit -m "Central: hoja de ruta diaria con reasignación por arrastre"`

### Task 14: Flota, conductores y ajustes

**Files:**
- Create: `src/app/central/flota/page.tsx`, `src/app/central/flota/actions.ts`

**Interfaces:**
- Produces: `guardarVehiculo(fd)`, `guardarConductor(fd)` (nombre, teléfono, vehículo habitual), `guardarAjustes(fd)`
  — todas con `exigirRol("operador")` y validación zod; el alta de un conductor nuevo crea el usuario con
  `clienteAdmin().auth.admin.createUser({ email, password, email_confirm: true })` y su perfil.

- [ ] **Step 1: Página** — tres bloques: tabla de vehículos (matrícula, modelo, plazas, estado activo/taller con
  toggle, km), tabla de conductores (nombre, email, teléfono, vehículo habitual con select) y formulario de ajustes
  (plazo de respuesta 5–60 min, umbral sin señal 1–30 min). Banner: «Mantenimiento (aceite, neumáticos, ITV):
  próximamente».
- [ ] **Step 2: Acciones** con zod: `plazas` 1–19, `matricula` no vacía y en mayúsculas, plazos en rango.
- [ ] **Step 3: Verificar** — poner un vehículo en taller → en `DialogoAsignar` su conductor aparece «Vehículo en taller».
- [ ] **Step 4: Commit** `git add -A && git commit -m "Central: gestión de flota, conductores y ajustes"`
- [ ] **Step 5: Documentación del bloque** — «Proceso iterativo» (fase 4) + capturas de la central en
  `docs/capturas/` (panel, servicios, asignar, hoja de ruta) y commit.

---

## Fase 5 · App del conductor (PWA)

### Task 15: PWA, layout del conductor, «Hoy» y envío de GPS

**Files:**
- Create: `src/app/manifest.ts`, `public/sw.js`, `public/icon-192.png`, `public/icon-512.png`,
  `src/app/conductor/layout.tsx`, `src/app/conductor/page.tsx`, `src/components/conductor/InterruptorServicio.tsx`,
  `src/app/conductor/actions.ts`

**Interfaces:**
- Produces:
  ```ts
  async function accionConductor(p: { idAccion: string; servicioId: string; accion: "aceptar" | "rechazar" | "salir" | "cargar" | "descargar"; motivo?: string }): Promise<ResultadoAccion>;
  async function fueraDeServicio(): Promise<void>;   // posicion_actual.en_servicio = false
  ```

- [ ] **Step 1: Manifest** — `src/app/manifest.ts`

```ts
import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TransferdeLuxe Conductor", short_name: "TdL Conductor", start_url: "/conductor", scope: "/conductor",
    display: "standalone", background_color: "#0f172a", theme_color: "#0f172a", lang: "es",
    icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }],
  };
}
```
Iconos: generarlos con un script Node (`sharp` como devDependency) a partir de un SVG con las letras «TdL» sobre
fondo `#0f172a`; guardar el script en `scripts/iconos.ts`.

`public/sw.js` (mínimo para instalabilidad; sin caché agresiva para no servir datos viejos):
```js
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
```
Registrar en `conductor/layout.tsx` con un componente cliente: `navigator.serviceWorker?.register("/sw.js", { scope: "/conductor" })`.
Nota: el scope `/conductor` exige cabecera `Service-Worker-Allowed: /conductor` o servir el SW desde la raíz con
scope reducido; usar scope `/` registrado desde `/conductor` (más simple) y mantener `scope: "/conductor"` en el manifest.

- [ ] **Step 2: Layout y acciones** — `conductor/layout.tsx`: `await exigirRol("conductor")`; cabecera fija con
  nombre y `InterruptorServicio`; navegación inferior (Hoy · Ticket · Historial). Botones mínimos 56 px de alto.

`conductor/actions.ts`:
```ts
"use server";
import { revalidatePath } from "next/cache";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { ejecutarAccion, repoSupabase } from "@/lib/servicios/acciones";

export async function accionConductor(p: { idAccion: string; servicioId: string; accion: "aceptar" | "rechazar" | "salir" | "cargar" | "descargar"; motivo?: string }) {
  const yo = await exigirRol("conductor");
  const r = await ejecutarAccion(repoSupabase(clienteAdmin()), { ...p, actor: { id: yo.id, rol: "conductor" } });
  revalidatePath("/conductor", "layout");
  return r;
}
export async function fueraDeServicio() {
  const yo = await exigirRol("conductor");
  await clienteAdmin().from("posicion_actual").update({ en_servicio: false }).eq("conductor_id", yo.id);
}
```

- [ ] **Step 3: `InterruptorServicio`** (cliente): estado guardado en `localStorage` (try/catch). Al activar:
  `navigator.geolocation.watchPosition` con `{ enableHighAccuracy: true, maximumAge: 10_000 }`; enviar como mucho una
  posición cada 15 s con `clienteNavegador().from("posiciones").insert({ conductor_id, lat, lng, velocidad, precision_m })`.
  Si error `PERMISSION_DENIED`: aviso rojo «Activa la ubicación para que la central te vea». Al desactivar:
  `clearWatch` + `fueraDeServicio()`. Indicador «📍 enviando · hace Xs».

- [ ] **Step 4: «Hoy»** — `conductor/page.tsx` (server) carga los servicios del conductor de hoy (Madrid) no
  cancelados, ordenados por hora, y un componente cliente con `useTiempoReal("servicios", ...)` filtrado a
  `conductor_id === yo`. Tarjetas: hora grande, origen → destino, pax/maletas, `EstadoBadge`; la primera no
  completada destacada con botón «Abrir».
- [ ] **Step 5: Verificar** — en el móvil (o DevTools con sensores) entrar como conductor1, activar servicio, y ver
  en `/central` el marcador moverse. Lighthouse → «Installable».
- [ ] **Step 6: Commit** `git add -A && git commit -m "PWA del conductor: hoja de ruta del día y envío de GPS"`

### Task 16: Servicio nuevo — aceptar / rechazar con cuenta atrás

**Files:**
- Create: `src/components/conductor/TarjetaServicioNuevo.tsx`, `src/lib/dominio/plazo.ts`
- Test: `tests/unit/plazo.test.ts`
- Modify: `src/app/conductor/layout.tsx` (monta la tarjeta global)

**Interfaces:**
- Produces: `function segundosRestantes(asignadoEn: string, plazoMin: number, ahora: Date): number` (≥ 0).

- [ ] **Step 1: Test que falla**

```ts
import { expect, test } from "vitest";
import { segundosRestantes } from "@/lib/dominio/plazo";
test("cuenta atrás", () => {
  const a = "2026-10-15T10:00:00Z";
  expect(segundosRestantes(a, 15, new Date("2026-10-15T10:05:00Z"))).toBe(600);
  expect(segundosRestantes(a, 15, new Date("2026-10-15T10:20:00Z"))).toBe(0);
});
```
- [ ] **Step 2: Ejecutar** → FAIL. **Step 3:** `plazo.ts`:
```ts
export function segundosRestantes(asignadoEn: string, plazoMin: number, ahora: Date): number {
  return Math.max(0, Math.floor((new Date(asignadoEn).getTime() + plazoMin * 60_000 - ahora.getTime()) / 1000));
}
```
Ejecutar → PASS.

- [ ] **Step 4: `TarjetaServicioNuevo`** (cliente, montada en el layout): suscripción Realtime a `servicios` con
  filtro `conductor_id=eq.<yo>`; si hay alguno en `asignado`, overlay a pantalla completa: hora, origen → destino,
  pax, maletas, vuelo, notas, cuenta atrás mm:ss (`segundosRestantes`, tick 1 s), `navigator.vibrate?.([300,150,300])`
  y sonido. Botones: «ACEPTAR» (verde, grande) → `accionConductor({ accion: "aceptar" })`; «Rechazar» → hoja con
  `MOTIVOS_RECHAZO` como botones y textarea obligatoria si «Otro» (se envía el texto como motivo). Si la cuenta
  llega a 0 o el servicio deja de estar `asignado` para mí → cerrar con aviso «El servicio ha vuelto a la central».
  Errores de la acción se muestran en la tarjeta.
- [ ] **Step 5: Verificar** — asignar desde la central → la tarjeta aparece en el móvil en < 2 s; rechazar con
  «Avería» → en la central aparece la alerta roja «Rechazado por …: Avería».
- [ ] **Step 6: Commit** `git add -A && git commit -m "Conductor: aceptar o rechazar servicios con plazo de respuesta"`

### Task 17: Servicio en curso y cola sin cobertura

**Files:**
- Create: `src/app/conductor/servicio/[id]/page.tsx`, `src/components/conductor/BotonPaso.tsx`, `src/lib/offline/cola.ts`
- Test: `tests/unit/cola.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface AccionPendiente { idAccion: string; servicioId: string; accion: "salir" | "cargar" | "descargar"; creadaEn: number }
  class ColaAcciones {
    constructor(almacen: { get(): string | null; set(v: string): void }, enviar: (a: AccionPendiente) => Promise<{ ok: boolean; error?: string }>);
    encolar(a: Omit<AccionPendiente, "creadaEn">): void;
    pendientes(): AccionPendiente[];
    vaciar(): Promise<{ enviadas: number; errores: string[] }>; // en orden; para en el primer fallo de red (throw); descarta las rechazadas por el servidor
  }
  ```

- [ ] **Step 1: Test que falla**

```ts
import { expect, test } from "vitest";
import { ColaAcciones } from "@/lib/offline/cola";

const memoria = () => { let v: string | null = null; return { get: () => v, set: (x: string) => { v = x; } }; };

test("encola y envía en orden", async () => {
  const enviadas: string[] = [];
  const c = new ColaAcciones(memoria(), async (a) => { enviadas.push(a.accion); return { ok: true }; });
  c.encolar({ idAccion: "1", servicioId: "s", accion: "salir" });
  c.encolar({ idAccion: "2", servicioId: "s", accion: "cargar" });
  expect(await c.vaciar()).toEqual({ enviadas: 2, errores: [] });
  expect(enviadas).toEqual(["salir", "cargar"]);
  expect(c.pendientes()).toEqual([]);
});

test("sin red: conserva la cola y reintenta luego", async () => {
  let red = false;
  const c = new ColaAcciones(memoria(), async () => { if (!red) throw new Error("offline"); return { ok: true }; });
  c.encolar({ idAccion: "1", servicioId: "s", accion: "cargar" });
  expect(await c.vaciar()).toEqual({ enviadas: 0, errores: [] });
  expect(c.pendientes()).toHaveLength(1);
  red = true;
  expect((await c.vaciar()).enviadas).toBe(1);
});

test("rechazada por el servidor: se descarta y se informa", async () => {
  const c = new ColaAcciones(memoria(), async () => ({ ok: false, error: "Este servicio ya no está asignado a ti" }));
  c.encolar({ idAccion: "1", servicioId: "s", accion: "cargar" });
  expect(await c.vaciar()).toEqual({ enviadas: 0, errores: ["Este servicio ya no está asignado a ti"] });
  expect(c.pendientes()).toEqual([]);
});
```

- [ ] **Step 2: Ejecutar** → FAIL. **Step 3:** `src/lib/offline/cola.ts`:

```ts
export interface AccionPendiente { idAccion: string; servicioId: string; accion: "salir" | "cargar" | "descargar"; creadaEn: number }
type Almacen = { get(): string | null; set(v: string): void };
type Enviar = (a: AccionPendiente) => Promise<{ ok: boolean; error?: string }>;

export class ColaAcciones {
  constructor(private almacen: Almacen, private enviar: Enviar) {}
  pendientes(): AccionPendiente[] { try { return JSON.parse(this.almacen.get() ?? "[]"); } catch { return []; } }
  private guardar(l: AccionPendiente[]) { this.almacen.set(JSON.stringify(l)); }
  encolar(a: Omit<AccionPendiente, "creadaEn">) { this.guardar([...this.pendientes(), { ...a, creadaEn: Date.now() }]); }
  async vaciar() {
    const errores: string[] = []; let enviadas = 0;
    let cola = this.pendientes();
    while (cola.length) {
      const [a, ...resto] = cola;
      let r: { ok: boolean; error?: string };
      try { r = await this.enviar(a); } catch { break; }
      if (r.ok) enviadas++; else errores.push(r.error ?? "Error");
      cola = resto; this.guardar(cola);
    }
    return { enviadas, errores };
  }
}
```
Ejecutar → PASS.

- [ ] **Step 4: Página del servicio** — `conductor/servicio/[id]/page.tsx`: datos, `MapaTrayecto`, enlaces
  `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>` (destino = origen del servicio si aún no se ha
  cargado; si no, destino final) y `https://waze.com/ul?ll=<lat>,<lng>&navigate=yes`, «Llamar al cliente» (`tel:`).
  `BotonPaso` (cliente): muestra `ACCION_SIGUIENTE_CONDUCTOR[estado]`; al pulsar genera `idAccion`, **actualiza la UI
  de forma optimista**, encola en `ColaAcciones` (almacén `localStorage` clave `tdl-cola`, envío =
  `accionConductor`) y llama a `vaciar()`. Reintenta en `window.addEventListener("online")` y cada 20 s. Muestra
  «⏳ pendiente de enviar (N)» si hay cola; errores de servidor en rojo. Tras `descargar` → «¡Servicio terminado!» y
  botón al siguiente servicio de hoy.
- [ ] **Step 5: Verificar** — DevTools «Offline», pulsar CARGA → «pendiente de enviar»; volver online → la central
  ve «Con pasajeros» y un solo evento `recogido`.
- [ ] **Step 6: Commit** `git add -A && git commit -m "Conductor: en camino, carga y descarga con cola sin cobertura"`

### Task 18: Ticket de combustible con IA

**Files:**
- Create: `src/app/api/tickets/leer/route.ts`, `src/app/conductor/ticket/page.tsx`, `src/components/conductor/CapturaTicket.tsx`,
  `src/app/conductor/ticket/actions.ts`, `src/lib/imagen.ts`
- Test: `tests/unit/ticket-form.test.ts`

**Interfaces:**
- Consumes: `obtenerLector`, `esCoherente`, `DatosTicket`.
- Produces:
  - `POST /api/tickets/leer` (multipart `foto`) → `{ fotoPath: string; datos: DatosTicket; coherente: boolean }` o
    `{ error }`; solo rol conductor; máx. 5 MB; tipos jpeg/png/webp; sube a `tickets/<conductorId>/<uuid>.<ext>`.
  - `esquemaTicket` (zod) y `guardarTicket(_, fd)` Server Action → inserta en `tickets_combustible` con
    `datos_ia` (JSON del lector, campo oculto) y `corregido = true` si algún valor difiere de lo leído; actualiza
    `vehiculos.km_actuales = greatest(km_actuales, km)`.
  - `function redimensionar(file: File, max = 1600): Promise<Blob>` en `src/lib/imagen.ts` (canvas → JPEG 0,85).

- [ ] **Step 1: Test que falla** (`esquemaTicket` y `fueCorregido`)

```ts
import { expect, test } from "vitest";
import { esquemaTicket, fueCorregido } from "@/app/conductor/ticket/esquema";

test("valida ticket y convierte comas", () => {
  const r = esquemaTicket.parse({ fecha: "2026-10-12", gasolinera: "Estación Demo", litros: "42,15", precio_litro: "1,459", importe: "61,50", tipo_combustible: "Diésel", km: "123456", foto_path: "c1/x.jpg", datos_ia: "{}" });
  expect(r.litros).toBe(42.15);
  expect(esquemaTicket.safeParse({ fecha: "2026-10-12", litros: "0", importe: "10", km: "1" }).success).toBe(false);
});

test("fueCorregido compara con lo leído", () => {
  const ia = { fecha: "2026-10-12", gasolinera: null, litros: 42.15, precio_litro: 1.459, importe: 61.5, tipo_combustible: "Diésel", confianza: "alta" as const };
  expect(fueCorregido(ia, { fecha: "2026-10-12", litros: 42.15, precio_litro: 1.459, importe: 61.5 })).toBe(false);
  expect(fueCorregido(ia, { fecha: "2026-10-12", litros: 40, precio_litro: 1.459, importe: 61.5 })).toBe(true);
});
```
(`esquemaTicket` y `fueCorregido` en `src/app/conductor/ticket/esquema.ts`, sin `"use server"`.)

- [ ] **Step 2: Ejecutar** → FAIL. **Step 3:** `src/app/conductor/ticket/esquema.ts`:

```ts
import { z } from "zod";
import type { DatosTicket } from "@/lib/lector/tipos";

const num = (min: number) => z.preprocess((v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v), z.number().gt(min));
export const esquemaTicket = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gasolinera: z.string().trim().optional().transform((v) => v || null),
  litros: num(0), precio_litro: num(0).optional().nullable(), importe: num(0),
  tipo_combustible: z.string().trim().optional().transform((v) => v || null),
  km: z.coerce.number().int().min(0),
  foto_path: z.string().optional().nullable(),
  datos_ia: z.string().optional().nullable(),
});
export function fueCorregido(ia: DatosTicket, final: { fecha: string; litros: number; precio_litro?: number | null; importe: number }): boolean {
  return ia.fecha !== final.fecha || ia.litros !== final.litros || ia.importe !== final.importe || (ia.precio_litro ?? null) !== (final.precio_litro ?? null);
}
```
Ejecutar → PASS.

- [ ] **Step 4: Ruta de lectura** — `src/app/api/tickets/leer/route.ts`

```ts
import { NextResponse } from "next/server";
import { perfilActual } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { obtenerLector, esCoherente, type ImagenTicket } from "@/lib/lector";

const TIPOS = ["image/jpeg", "image/png", "image/webp"] as const;

export async function POST(req: Request) {
  const yo = await perfilActual();
  if (!yo || yo.rol !== "conductor") return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const foto = (await req.formData()).get("foto");
  if (!(foto instanceof File)) return NextResponse.json({ error: "Falta la foto" }, { status: 400 });
  if (foto.size > 5 * 1024 * 1024) return NextResponse.json({ error: "La foto pesa más de 5 MB" }, { status: 400 });
  if (!TIPOS.includes(foto.type as (typeof TIPOS)[number])) return NextResponse.json({ error: "Formato no admitido" }, { status: 400 });

  const bytes = Buffer.from(await foto.arrayBuffer());
  const ext = foto.type.split("/")[1];
  const fotoPath = `${yo.id}/${crypto.randomUUID()}.${ext}`;
  const sb = clienteAdmin();
  const { error } = await sb.storage.from("tickets").upload(fotoPath, bytes, { contentType: foto.type });
  if (error) return NextResponse.json({ error: "No se pudo guardar la foto" }, { status: 500 });

  try {
    const datos = await obtenerLector().leer({ base64: bytes.toString("base64"), mediaType: foto.type as ImagenTicket["mediaType"] });
    return NextResponse.json({ fotoPath, datos, coherente: esCoherente(datos) });
  } catch {
    return NextResponse.json({ fotoPath, datos: null, coherente: true, aviso: "No se pudo leer el ticket; rellénalo a mano" });
  }
}
```

- [ ] **Step 5: Acción de guardado** — `src/app/conductor/ticket/actions.ts`: `exigirRol("conductor")`, parse con
  `esquemaTicket`, `vehiculo_id` = vehículo habitual del conductor (error si no tiene), `corregido` con
  `fueCorregido(JSON.parse(datos_ia))` si hay `datos_ia`, insert con `clienteAdmin()`, update de `km_actuales`
  solo si el nuevo km es mayor, `revalidatePath("/central/combustible")`.

- [ ] **Step 6: UI** — `CapturaTicket` (cliente): `<input type="file" accept="image/*" capture="environment">`
  grande «📷 Hacer foto del ticket» → `redimensionar` → `POST /api/tickets/leer` con spinner «Leyendo ticket…» →
  formulario prellenado (fecha, gasolinera, litros, €/L, importe, tipo, **km** vacío y obligatorio), miniatura de la
  foto, banner amarillo si `!coherente` («Los litros × precio no cuadran con el importe: revísalo»), banner gris si
  `aviso`. Botón «Guardar ticket». Opción «Rellenar sin foto».

`src/lib/imagen.ts`:
```ts
export async function redimensionar(file: File, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo procesar la imagen"))), "image/jpeg", 0.85));
}
```

- [ ] **Step 7: Verificar** con una foto de ticket de ejemplo (de `public/demo/`, Task 20) → campos rellenos; guardar
  → aparece en `tickets_combustible`.
- [ ] **Step 8: Commit** `git add -A && git commit -m "Conductor: ticket de combustible leído con Claude Haiku"`

### Task 19: Historial del conductor y combustible en la central

**Files:**
- Create: `src/app/conductor/historial/page.tsx`, `src/app/central/combustible/page.tsx`,
  `src/components/central/GraficoCombustible.tsx`

**Interfaces:**
- Consumes: `resumenCombustible`, `consumoMedioL100`, `gastoPorMes`.

- [ ] **Step 1: Historial del conductor** — últimos 7 días: servicios (fecha, trayecto, estado) y tickets (fecha,
  litros, importe).
- [ ] **Step 2: Combustible en la central** — filtros por querystring `vehiculo`, `conductor`, `mes`; tarjetas KPI
  (gasto total €, litros, nº tickets, consumo medio L/100 km por vehículo con `consumoMedioL100` sobre los tickets de
  cada vehículo); `GraficoCombustible` (recharts `BarChart` gasto por mes, con `gastoPorMes`); tabla de tickets con
  miniatura (URL firmada `createSignedUrl(path, 3600)` generada en servidor), marca «✏️ corregido» y «🤖 leído por IA».
  Cargar la skill `dataviz` antes de diseñar el gráfico.
- [ ] **Step 3: Verificar** con los tickets del seed: los KPI coinciden con un `select sum(importe)` en SQL.
- [ ] **Step 4: Commit** `git add -A && git commit -m "Combustible: historial del conductor y panel de gasto en la central"`
- [ ] **Step 5: Documentación del bloque** — «Proceso iterativo» (fase 5) + capturas del móvil en `docs/capturas/`.

---

## Fase 6 · Demo, pruebas E2E y despliegue

### Task 20: Datos de demo, «Restablecer demo» y simulador de ruta

**Files:**
- Create: `src/lib/demo/datos.ts`, `src/lib/demo/seed.ts`, `src/lib/demo/rutas.ts`, `scripts/seed.ts`,
  `src/components/central/BotonesDemo.tsx`, `src/app/central/demo-actions.ts`, `public/demo/ticket-1.jpg`,
  `public/demo/ticket-2.jpg`, `public/aviso.mp3`
- Test: `tests/unit/rutas.test.ts`

**Interfaces:**
- Produces:
  ```ts
  async function sembrarDemo(sb: SupabaseClient, password: string, hoy?: Date): Promise<void>; // idempotente: borra y recrea
  const RUTAS_DEMO: Record<string, Punto[]>;   // una por conductor, ≥ 20 puntos por carretera real (Reus–Salou, Salou–Cambrils, Tarragona–PortAventura)
  function posicionSimulada(ruta: Punto[], ahora: number, pasoMs?: number): Punto; // recorre ida y vuelta
  async function simularPaso(): Promise<void>;  // Server Action: inserta una posición por conductor
  async function restablecerDemo(): Promise<void>;
  ```
  Ambas acciones exigen operador y `NEXT_PUBLIC_MODO_DEMO === "true"`.

- [ ] **Step 1: Test que falla**

```ts
import { expect, test } from "vitest";
import { posicionSimulada } from "@/lib/demo/rutas";
const ruta = [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }, { lat: 2, lng: 2 }];
test("ida y vuelta por la ruta", () => {
  expect(posicionSimulada(ruta, 0, 1000)).toEqual({ lat: 0, lng: 0 });
  expect(posicionSimulada(ruta, 2000, 1000)).toEqual({ lat: 2, lng: 2 });
  expect(posicionSimulada(ruta, 3000, 1000)).toEqual({ lat: 1, lng: 1 });
  expect(posicionSimulada(ruta, 4000, 1000)).toEqual({ lat: 0, lng: 0 });
});
```
- [ ] **Step 2: Ejecutar** → FAIL. **Step 3:** en `rutas.ts`:
```ts
export function posicionSimulada(ruta: Punto[], ahora: number, pasoMs = 3000): Punto {
  const n = ruta.length, ciclo = 2 * (n - 1);
  const i = Math.floor(ahora / pasoMs) % ciclo;
  return ruta[i < n ? i : ciclo - i];
}
```
y `RUTAS_DEMO` con coordenadas reales de carreteras públicas (N-340, T-11, C-31B) generadas por la IA y comprobadas
visualmente en el mapa. Ejecutar → PASS.

- [ ] **Step 4: Datos** — `datos.ts`:
  - Usuarios: `central@transferdeluxe.test` (operador «Central Demo»), `conductor1@…` «Marc Demo»,
    `conductor2@…` «Laia Demo», `conductor3@…` «Jordi Demo» (nombres genéricos con apellido «Demo»).
  - Vehículos: `0001-TDL` «Mercedes Vito (demo)» 8 plazas, `0002-TDL` «Mercedes Vito (demo)» 8 plazas,
    `0003-TDL` «Volkswagen Caravelle (demo)» 7 plazas (matrículas imposibles en España, a propósito).
  - Lugares frecuentes: Aeropuerto de Reus (41.1474, 1.1672), Aeropuerto de Barcelona T1 (41.2889, 2.0731),
    Aeropuerto de Girona (41.9010, 2.7606), Estación Camp de Tarragona (41.1910, 1.2700), Barcelona Sants
    (41.3790, 2.1400), PortAventura World (41.0880, 1.1580), Ferrari Land (41.0855, 1.1530), Salou – Plaza Europa
    (41.0760, 1.1400), Cambrils – Puerto (41.0670, 1.0600), La Pineda (41.0790, 1.1830), Tarragona – Catedral
    (41.1189, 1.2580).
  - Servicios: ~18 entre ayer, hoy y mañana con clientes ficticios (`cliente1@ejemplo.test`…, teléfonos
    `600 000 0xx`): completados ayer, hoy uno en `recogido`, uno `aceptado`, uno `asignado`, dos `pendiente` (uno con
    rechazo previo «Avería»), uno de 12 pax para subcontratar, una reserva con vuelta.
  - Tickets: 8 tickets en 2 meses para los 3 vehículos con km crecientes; 2 con foto de `public/demo/`.
- [ ] **Step 5: `sembrarDemo`** — borra en orden (`eventos_servicio`, `acciones_procesadas`, `servicios`,
  `tickets_combustible`, `posiciones`, `posicion_actual`, `perfiles`, usuarios `@transferdeluxe.test` con
  `auth.admin.deleteUser`, `vehiculos`, `lugares_frecuentes`), recrea todo con fechas relativas a `hoy`, sube las
  fotos demo al bucket, inserta eventos coherentes con cada estado. `scripts/seed.ts` carga `.env.local` con
  `dotenv` y llama a `sembrarDemo(createClient(url, serviceKey), process.env.DEMO_PASSWORD!)`.
- [ ] **Step 6: Imágenes de ticket de demo** — generarlas con un script (`scripts/tickets-demo.ts`, `sharp` + SVG):
  ticket de «ESTACIÓN DEMO COSTA DORADA», fecha, «DIESEL A», litros, €/L, total, texto «TICKET DE DEMOSTRACIÓN».
  `aviso.mp3`: generar un pitido corto con un script (ffmpeg si está instalado; si no, WAV generado en Node y
  referenciar `/aviso.wav`).
- [ ] **Step 7: `BotonesDemo`** en el panel (solo modo demo): «▶ Simular ruta» (activa un `setInterval` de 3 s que
  llama a `simularPaso`; vuelve a pulsar para parar) y «↺ Restablecer demo» (confirmación → `restablecerDemo` →
  recarga).
- [ ] **Step 8: Verificar** — `npm run seed`; login con las 4 cuentas; simular ruta → los 3 marcadores se mueven por
  carretera; restablecer → todo vuelve al estado inicial.
- [ ] **Step 9: Commit** `git add -A && git commit -m "Datos de demo, restablecer demo y simulador de ruta"`

### Task 21: Test E2E del flujo completo

**Files:**
- Create: `tests/e2e/flujo.spec.ts`

- [ ] **Step 1: Test**

```ts
import { expect, test, type Browser } from "@playwright/test";

const PASS = process.env.DEMO_PASSWORD!;
async function entrar(browser: Browser, email: string) {
  const ctx = await browser.newContext({ geolocation: { latitude: 41.0763, longitude: 1.1416 }, permissions: ["geolocation"] });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(PASS);
  await page.getByRole("button", { name: "Entrar" }).click();
  return page;
}

test("reserva web → asignar → aceptar → en camino → carga → descarga", async ({ browser, page }) => {
  const cliente = `e2e-${Date.now()}`;
  await page.goto("/reservar");
  await page.getByLabel("Dirección de recogida").fill("Aeropuerto de Reus");
  await page.getByText("Aeropuerto de Reus").first().click();
  await page.getByLabel("Dirección de destino").fill("PortAventura");
  await page.getByText("PortAventura World").first().click();
  const manana = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  await page.getByLabel("Fecha de recogida").fill(manana);
  await page.getByLabel("Hora de recogida").fill("11:00");
  await page.getByLabel("Pasajeros").selectOption("3");
  await page.getByLabel("Nombre").fill(cliente);
  await page.getByLabel("Email").fill("e2e@ejemplo.test");
  await page.getByLabel("Teléfono").fill("600000999");
  await page.getByLabel(/política de privacidad/).check();
  await page.getByRole("button", { name: "Reservar" }).click();
  await expect(page.getByText("¡Reserva recibida!")).toBeVisible();

  const central = await entrar(browser, "central@transferdeluxe.test");
  await expect(central.getByText(cliente)).toBeVisible();          // alerta «Reserva nueva»
  await central.getByText(cliente).click();
  await central.getByRole("button", { name: "Asignar" }).click();
  await central.getByRole("button", { name: "Asignar" }).first().click(); // primera tarjeta (recomendada)
  await expect(central.getByText("Esperando respuesta")).toBeVisible();
  const asignado = (await central.getByTestId("conductor-asignado").textContent())!;
  const n = { "Marc Demo": 1, "Laia Demo": 2, "Jordi Demo": 3 }[asignado.trim()]!;

  const movil = await entrar(browser, `conductor${n}@transferdeluxe.test`);
  await movil.getByRole("button", { name: "ACEPTAR" }).click();
  await movil.getByText(cliente).click();
  for (const paso of ["Salgo hacia la recogida", "CARGA – pasajeros a bordo", "DESCARGA – servicio terminado"]) {
    await movil.getByRole("button", { name: paso }).click();
  }
  await expect(movil.getByText("¡Servicio terminado!")).toBeVisible();
  await central.reload();
  await expect(central.getByText("Completado")).toBeVisible();
});

test("rechazo vuelve a la central con alerta", async ({ browser }) => {
  const central = await entrar(browser, "central@transferdeluxe.test");
  await central.goto("/central/servicios?estado=pendiente");
  await central.getByRole("link", { name: /Ver/ }).first().click();
  await central.getByRole("button", { name: "Asignar" }).click();
  await central.getByTestId("tarjeta-conductor-Jordi Demo").getByRole("button", { name: /Asignar/ }).click();
  const movil = await entrar(browser, "conductor3@transferdeluxe.test");
  await movil.getByRole("button", { name: "Rechazar" }).click();
  await movil.getByRole("button", { name: "Avería" }).click();
  await central.goto("/central");
  await expect(central.getByText(/Rechazado por Jordi Demo: Avería/)).toBeVisible();
});
```
Añadir los `data-testid` usados (`conductor-asignado` en la ficha, `tarjeta-conductor-<nombre>` en `DialogoAsignar`)
y las `label` exactas en los formularios.

- [ ] **Step 2: Ejecutar** `npm run seed && npm run test:e2e` → PASS (si falla, depurar con
  superpowers:systematic-debugging antes de tocar código).
- [ ] **Step 3: Commit** `git add -A && git commit -m "Test E2E del flujo completo y del rechazo"`

### Task 22: Despliegue en Hostinger y documentación de entrega

**Files:**
- Modify: `README.md`, `docs/DOCUMENTACION_TECNICA.md`, `docs/ENTREGA_CHECKLIST.md`, `next.config.ts`

- [ ] **Step 1: Preparar build de producción** — en `next.config.ts` `output: "standalone"` solo si Hostinger lo
  requiere (por defecto no); `npm run build && npm start` en local → OK; `npm test` → todo PASS.
- [ ] **Step 2 (humano, guiado):** en hPanel → Websites → Add Website → Node.js Web App → Import Git Repository →
  autorizar GitHub y elegir `osalgado50/TransferdeLuxe` rama `main`; Node 22; build `npm run build`; start `npm start`;
  variables de entorno: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_MODO_DEMO=true`, `DEMO_PASSWORD`. Conectar el subdominio elegido con SSL.
- [ ] **Step 3: Supabase Auth** — en Authentication → URL Configuration poner la URL del subdominio como Site URL.
- [ ] **Step 4: Prueba en producción** — `E2E_BASE_URL=https://<subdominio> npm run test:e2e` → PASS; prueba manual en
  un móvil real: instalar PWA, GPS, foto de ticket. Si el build de Hostinger falla por recursos → plan B Vercel
  (spec §12) y documentarlo en «Challenges».
- [ ] **Step 5: Documentación** — README (descripción, URL, credenciales de prueba, stack, cómo ejecutar);
  `DOCUMENTACION_TECNICA.md` completa (descripción, plataforma, arquitectura con el diagrama, casos de uso, proceso
  iterativo, challenges, capturas); checklist con la URL de la app.
- [ ] **Step 6: Commit y push** `git add -A && git commit -m "Despliegue en Hostinger y documentación de entrega" && git push`

---

## Fuera de este plan (entregables no-código, se gestionan aparte)

- Volcar `DOCUMENTACION_TECNICA.md` al Google Doc técnico y las transcripciones (`python3 -I scripts/export_transcripts.py`)
  al Google Doc de prompts.
- Guion del vídeo (≤ 5 min) y grabación por el humano.
- Compartir el repo con `automatizaciones@thebigschool.com`, permisos de Drive y envío del formulario (lo confirma el humano).
