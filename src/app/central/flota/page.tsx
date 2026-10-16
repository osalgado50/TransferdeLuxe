import Link from "next/link";
import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import CamposNuevoVehiculo from "@/components/central/CamposNuevoVehiculo";
import GestionFavoritos from "@/components/central/GestionFavoritos";
import AyudaSonidos from "@/components/central/AyudaSonidos";
import type { Favorito } from "@/lib/dominio/favoritos";
import { guardarVehiculo, guardarConductor, guardarOperador, guardarAjustes, guardarModulos, guardarBase } from "./actions";
import CampoBase from "@/components/central/CampoBase";
import { MODULOS, leerModulos } from "@/lib/dominio/modulos";
import { CampoContrasena } from "@/components/comun/CampoContrasena";

export const metadata = { title: "Flota y ajustes · TransferdeLuxe" };

const campo = "rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm";
// Columnas: el modelo se estira y el botón ocupa lo que necesita, así «Guardar» no queda cortado a 1000 px.
const COLUMNAS = "grid-cols-[7rem_minmax(7rem,1fr)_4rem_4rem_7rem_6rem_auto]";
const rejilla = `grid ${COLUMNAS} items-center gap-2`;
const rejillaMovil = "grid grid-cols-2 items-end gap-2 md:grid-cols-[7rem_minmax(7rem,1fr)_4rem_4rem_7rem_6rem_auto] md:items-center";
const boton = "rounded bg-marca px-3 py-2 md:py-1 text-sm font-medium text-white hover:bg-marca-oscuro";

export default async function Flota({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirRol("operador");
  const f = await searchParams;
  const sb = clienteAdmin();
  const [{ data: vehiculos }, { data: conductores }, { data: ajustes }, { data: usuarios }, { data: favoritos, error: errFavoritos }, { data: operadores }] = await Promise.all([
    sb.from("vehiculos").select("*").order("matricula"),
    sb.from("perfiles").select("*").eq("rol", "conductor").order("nombre"),
    sb.from("ajustes").select("*").eq("id", 1).single(),
    sb.auth.admin.listUsers({ perPage: 1000 }),
    sb.from("favoritos").select("*").order("tipo").order("nombre"),
    sb.from("perfiles").select("*").eq("rol", "operador").order("nombre"),
  ]);
  const emails = new Map((usuarios?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  const demo = process.env.NEXT_PUBLIC_MODO_DEMO === "true";
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-marca-claro">Flota y ajustes</h1>
      {f.error && <p role="alert" className="rounded bg-red-900/50 p-2 text-red-200">{f.error}</p>}
      {f.ok && <p role="status" className="rounded bg-emerald-900/50 p-2 text-emerald-200">Cambios guardados</p>}
      <p className="rounded border border-slate-700 p-2 text-sm text-slate-400">
        Mantenimiento (aceite, neumáticos, ITV):{" "}
        {leerModulos(ajustes?.modulos).mantenimiento
          ? <Link href="/central/mantenimiento" className="text-marca-claro hover:underline">ver y registrar en Mantenimiento</Link>
          : <a href="#modulos" className="text-marca-claro hover:underline">activa el módulo «Mantenimiento» más abajo</a>}
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Vehículos</h2>
        <div className="md:overflow-x-auto">
          <div className="md:min-w-[44rem]">
            <div className={`${rejilla} hidden text-sm text-slate-400 md:grid`}>
              <span>Matrícula</span><span>Modelo</span><span>Plazas</span><span>Maletas</span><span>Estado</span><span>Km</span><span />
            </div>
            {(vehiculos ?? []).map((v) => (
              <form key={v.id} action={guardarVehiculo} className={`${rejillaMovil} border-t border-slate-700 py-3 md:py-1`}>
                <input type="hidden" name="id" value={v.id} />
                <label className="grid min-w-0 gap-0.5"><span className="text-xs text-slate-400 md:hidden">Matrícula</span><input name="matricula" defaultValue={v.matricula} aria-label="Matrícula" className={campo} /></label>
                <label className="grid min-w-0 gap-0.5"><span className="text-xs text-slate-400 md:hidden">Modelo</span><input name="modelo" defaultValue={v.modelo} aria-label="Modelo" className={campo} /></label>
                <label className="grid min-w-0 gap-0.5"><span className="text-xs text-slate-400 md:hidden">Plazas</span><input name="plazas" type="number" min={1} max={19} defaultValue={v.plazas} aria-label="Plazas" className={campo} /></label>
                <label className="grid min-w-0 gap-0.5"><span className="text-xs text-slate-400 md:hidden">Maletas</span><input name="maletas" type="number" min={0} max={30} defaultValue={v.maletas} aria-label="Maletas" className={campo} /></label>
                <label className="grid min-w-0 gap-0.5"><span className="text-xs text-slate-400 md:hidden">Estado</span><select name="estado" defaultValue={v.estado} aria-label="Estado" className={campo}>
                  <option value="activo">Activo</option><option value="taller">En taller</option>
                </select></label>
                <label className="grid min-w-0 gap-0.5"><span className="text-xs text-slate-400 md:hidden">Km</span><input name="km_actuales" type="number" min={0} defaultValue={v.km_actuales} aria-label="Km" className={campo} /></label>
                <button className={`${boton} col-span-2 md:col-span-1`}>Guardar</button>
              </form>
            ))}
          </div>
        </div>
        <form action={guardarVehiculo} className="grid grid-cols-1 gap-2 border-t border-slate-700 pt-2 sm:flex sm:flex-wrap sm:items-end">
          <span className="py-1 text-sm text-slate-400">Nuevo:</span>
          <div className="flex flex-col gap-1"><label htmlFor="nv-matricula" className="text-xs text-slate-400">Matrícula</label><input id="nv-matricula" name="matricula" placeholder="Matrícula" required className={`${campo} w-full sm:w-28`} /></div>
          <div className="flex flex-col gap-1"><label htmlFor="nv-modelo" className="text-xs text-slate-400">Modelo</label><input id="nv-modelo" name="modelo" placeholder="Modelo" required className={`${campo} w-full sm:w-40`} /></div>
          <CamposNuevoVehiculo />
          <input type="hidden" name="estado" value="activo" />
          <div className="flex flex-col gap-1"><label htmlFor="nv-km" className="text-xs text-slate-400">Km</label><input id="nv-km" name="km_actuales" type="number" min={0} defaultValue={0} className={`${campo} w-full sm:w-28`} /></div>
          <button className={boton}>Añadir vehículo</button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Conductores</h2>
        {(conductores ?? []).map((c) => (
          <form key={c.id} action={guardarConductor} className="grid grid-cols-1 gap-2 border-t border-slate-700 py-3 sm:flex sm:flex-wrap sm:items-center sm:py-1">
            <input type="hidden" name="id" value={c.id} />
            <input name="nombre" defaultValue={c.nombre} aria-label="Nombre" className={`${campo} w-full sm:w-40`} />
            <span className="truncate text-sm sm:w-56 text-slate-400" title={emails.get(c.id)}>{emails.get(c.id)}</span>
            <input name="telefono" defaultValue={c.telefono ?? ""} aria-label="Teléfono" className={`${campo} w-full sm:w-32`} />
            <select name="vehiculo_habitual_id" defaultValue={c.vehiculo_habitual_id ?? ""} aria-label="Vehículo habitual" className={campo}>
              <option value="">Sin vehículo</option>
              {(vehiculos ?? []).map((v) => <option key={v.id} value={v.id}>{v.matricula} · {v.modelo}{v.estado === "taller" ? " (taller)" : ""}</option>)}
            </select>
            <button className={boton}>Guardar</button>
          </form>
        ))}
        <form action={guardarConductor} className="grid grid-cols-1 gap-2 border-t border-slate-700 pt-2 sm:flex sm:flex-wrap sm:items-end">
          <span className="py-1 text-sm text-slate-400">Nuevo:</span>
          <div className="flex flex-col gap-1"><label htmlFor="nc-nombre" className="text-xs text-slate-400">Nombre</label><input id="nc-nombre" name="nombre" placeholder="Nombre" required className={`${campo} w-full sm:w-40`} /></div>
          <div className="flex flex-col gap-1"><label htmlFor="nc-email" className="text-xs text-slate-400">Email</label><input id="nc-email" name="email" type="email" placeholder="conductor@transferdeluxe.test" required className={`${campo} w-full sm:w-56`} /></div>
          <div className="flex flex-col gap-1"><label htmlFor="nc-telefono" className="text-xs text-slate-400">Teléfono</label><input id="nc-telefono" name="telefono" placeholder="Teléfono" className={`${campo} w-full sm:w-32`} /></div>
          <div className="flex flex-col gap-1"><label htmlFor="nc-vehiculo" className="text-xs text-slate-400">Vehículo</label><select id="nc-vehiculo" name="vehiculo_habitual_id" defaultValue="" className={campo}>
            <option value="">Sin vehículo</option>
            {(vehiculos ?? []).map((v) => <option key={v.id} value={v.id}>{v.matricula} · {v.modelo}</option>)}
          </select></div>
          {!demo && <div className="flex flex-col gap-1"><label htmlFor="nc-password" className="text-xs text-slate-400">Contraseña (mín. 8)</label><div className="sm:w-48"><CampoContrasena id="nc-password" name="password" minLength={8} required autoComplete="new-password" className={campo} /></div></div>}
          <button className={boton}>Añadir conductor</button>
        </form>
        {demo && <p className="text-xs text-slate-500">Modo demo: el conductor nuevo usa la contraseña de demo y su email debe terminar en @transferdeluxe.test.</p>}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Central</h2>
        <p className="text-sm text-slate-400">Si alguien de la central también hace servicios, marca «También conduce»: aparecerá en la sugerencia, el mapa y los informes, y podrá usar «Mis servicios».</p>
        {(operadores ?? []).map((o) => (
          <form key={o.id} action={guardarOperador} className="grid grid-cols-1 gap-2 border-t border-slate-700 py-3 sm:flex sm:flex-wrap sm:items-center sm:py-1">
            <input type="hidden" name="id" value={o.id} />
            <span className="text-sm sm:w-40">{o.nombre}</span>
            <span className="truncate text-sm sm:w-56 text-slate-400" title={emails.get(o.id)}>{emails.get(o.id)}</span>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="conduce" defaultChecked={o.conduce === true} className="size-4 accent-marca-claro" />También conduce</label>
            <select name="vehiculo_habitual_id" defaultValue={o.vehiculo_habitual_id ?? ""} aria-label="Vehículo habitual" className={campo}>
              <option value="">Sin vehículo</option>
              {(vehiculos ?? []).map((v) => <option key={v.id} value={v.id}>{v.matricula} · {v.modelo}{v.estado === "taller" ? " (taller)" : ""}</option>)}
            </select>
            <button className={boton}>Guardar</button>
          </form>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Favoritos</h2>
        {errFavoritos && <p role="alert" className="rounded bg-amber-900/50 p-2 text-sm text-amber-200">No se pudieron cargar los favoritos.</p>}
        <GestionFavoritos favoritos={(favoritos ?? []) as Favorito[]} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Lugares de la empresa</h2>
        <p className="text-sm text-slate-400">Clientes y sitios habituales (🏢) con su dirección exacta: salen los primeros al escribir su nombre en «Nuevo servicio».</p>
        <Link href="/central/lugares" className="inline-block rounded border border-slate-600 px-3 py-2 text-sm hover:border-marca-claro">Gestionar lugares de la empresa</Link>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Ajustes</h2>
        <form action={guardarAjustes} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Plazo de respuesta (5–60 min)<br />
            <input name="plazo_respuesta_min" type="number" min={5} max={60} defaultValue={ajustes?.plazo_respuesta_min ?? 15} className={`${campo} w-24`} /></label>
          <label className="text-sm">Umbral sin señal (1–30 min)<br />
            <input name="umbral_sin_senal_min" type="number" min={1} max={30} defaultValue={ajustes?.umbral_sin_senal_min ?? 5} className={`${campo} w-24`} /></label>
          <label className="text-sm">Margen mínimo entre servicios (0–120 min)<br />
            <input name="margen_minimo_min" type="number" min={0} max={120} defaultValue={ajustes?.margen_minimo_min ?? 15} className={`${campo} w-24`} /></label>
          <label className="text-sm">Alerta CARGA/DESCARGA lejos del punto (50–20000 m)<br />
            <input name="umbral_anomalia_m" type="number" min={50} max={20000} step={50} defaultValue={ajustes?.umbral_anomalia_m ?? 500} className={`${campo} w-28`} /></label>
          {leerModulos(ajustes?.modulos).vuelos && <label className="text-sm">Margen equipaje tras aterrizar (0–180 min)<br />
            <input name="margen_equipaje_min" type="number" min={0} max={180} defaultValue={ajustes?.margen_equipaje_min ?? 20} className={`${campo} w-24`} /></label>}
          <label className="text-sm">Teléfono de la central<br />
            <input name="telefono_central" type="tel" maxLength={20} placeholder="+34 …" defaultValue={ajustes?.telefono_central ?? ""} className={`${campo} w-44`} /></label>
          <label className="text-sm">WhatsApp de la central<br />
            <input name="whatsapp_central" type="tel" maxLength={20} placeholder="+34 …" defaultValue={ajustes?.whatsapp_central ?? ""} className={`${campo} w-44`} /></label>
          <button className={boton}>Guardar ajustes</button>
        </form>
        <p className="text-xs text-slate-500">El plazo de respuesta se aplica solo a los servicios nuevos; los ya creados conservan el suyo.
          Si un conductor marca CARGA o DESCARGA a más de esa distancia de la recogida o del destino, la central recibe un aviso.
          El margen mínimo es el tiempo que debe sobrar entre la llegada a una recogida y su hora, desde el fin del servicio anterior
          (lo usan «Asignar automáticamente» y el semáforo de la hoja de ruta).
          El teléfono y el WhatsApp de la central se ofrecen al cliente en la web de reservas si a la hora que pide no hay ningún
          coche libre (si están vacíos, no salen esos botones).</p>
      </section>

      <section id="base" className="space-y-2">
        <h2 className="text-lg font-semibold">Base / depósito</h2>
        <p className="text-sm text-slate-400">Donde se guardan los coches y se hace el relevo: el primer servicio de cada tramo sale de aquí y el último
          tiene que poder volver antes del fin del turno. Los horarios de cada conductor se configuran en <Link href="/central/horarios" className="text-marca-claro hover:underline">Horarios</Link>.</p>
        <form action={guardarBase} className="flex flex-wrap items-end gap-3">
          <CampoBase texto={ajustes?.base_texto ?? null} lat={ajustes?.base_lat ?? null} lng={ajustes?.base_lng ?? null} />
          <button className={boton}>Guardar base</button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Sonidos</h2>
        <p className="text-sm text-slate-400">Con el panel abierto, cada cambio de un servicio suena distinto para saber qué pasa sin mirar. Se silencian con el botón 🔊/🔇 del menú (se recuerda en este navegador). Si llegan varios a la vez, suena solo el más importante.</p>
        <AyudaSonidos />
      </section>

      <section id="modulos" className="space-y-2">
        <h2 className="text-lg font-semibold">Módulos</h2>
        <p className="text-sm text-slate-400">Activa o desactiva funciones. Un módulo desactivado desaparece de la central y de la app de los conductores.</p>
        <form action={guardarModulos} className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {MODULOS.map((m) => (
              <label key={m.clave} className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm">
                <input type="checkbox" name={`mod_${m.clave}`} defaultChecked={leerModulos(ajustes?.modulos)[m.clave]} className="mt-1 size-4 accent-marca-claro" />
                <span><span className="font-medium">{m.nombre}</span><br /><span className="text-slate-400">{m.descripcion}</span></span>
              </label>
            ))}
          </div>
          <button className={boton}>Guardar módulos</button>
        </form>
      </section>
    </div>
  );
}
