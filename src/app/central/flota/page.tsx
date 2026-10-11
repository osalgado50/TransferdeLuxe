import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import CamposNuevoVehiculo from "@/components/central/CamposNuevoVehiculo";
import GestionFavoritos from "@/components/central/GestionFavoritos";
import type { Favorito } from "@/lib/dominio/favoritos";
import { guardarVehiculo, guardarConductor, guardarAjustes, guardarModulos } from "./actions";
import { MODULOS, leerModulos } from "@/lib/dominio/modulos";
import { CampoContrasena } from "@/components/comun/CampoContrasena";

const campo = "rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm";
const rejilla = "grid grid-cols-[7rem_10rem_4rem_4rem_7rem_7rem_6rem] items-center gap-2";
const rejillaMovil = "grid grid-cols-2 items-end gap-2 md:grid-cols-[7rem_10rem_4rem_4rem_7rem_7rem_6rem] md:items-center";
const boton = "rounded bg-marca px-3 py-2 md:py-1 text-sm font-medium text-white hover:bg-marca-oscuro";

export default async function Flota({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirRol("operador");
  const f = await searchParams;
  const sb = clienteAdmin();
  const [{ data: vehiculos }, { data: conductores }, { data: ajustes }, { data: usuarios }, { data: favoritos, error: errFavoritos }] = await Promise.all([
    sb.from("vehiculos").select("*").order("matricula"),
    sb.from("perfiles").select("*").eq("rol", "conductor").order("nombre"),
    sb.from("ajustes").select("*").eq("id", 1).single(),
    sb.auth.admin.listUsers({ perPage: 1000 }),
    sb.from("favoritos").select("*").order("tipo").order("nombre"),
  ]);
  const emails = new Map((usuarios?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  const demo = process.env.NEXT_PUBLIC_MODO_DEMO === "true";
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-marca-claro">Flota y ajustes</h1>
      {f.error && <p role="alert" className="rounded bg-red-900/50 p-2 text-red-200">{f.error}</p>}
      {f.ok && <p role="status" className="rounded bg-emerald-900/50 p-2 text-emerald-200">Cambios guardados</p>}
      <p className="rounded border border-slate-700 p-2 text-sm text-slate-400">Mantenimiento (aceite, neumáticos, ITV): próximamente</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Vehículos</h2>
        <div className="md:overflow-x-auto">
          <div className="md:min-w-[720px]">
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
        <h2 className="text-lg font-semibold">Favoritos</h2>
        {errFavoritos && <p role="alert" className="rounded bg-amber-900/50 p-2 text-sm text-amber-200">No se pudieron cargar los favoritos.</p>}
        <GestionFavoritos favoritos={(favoritos ?? []) as Favorito[]} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Ajustes</h2>
        <form action={guardarAjustes} className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Plazo de respuesta (5–60 min)<br />
            <input name="plazo_respuesta_min" type="number" min={5} max={60} defaultValue={ajustes?.plazo_respuesta_min ?? 15} className={`${campo} w-24`} /></label>
          <label className="text-sm">Umbral sin señal (1–30 min)<br />
            <input name="umbral_sin_senal_min" type="number" min={1} max={30} defaultValue={ajustes?.umbral_sin_senal_min ?? 5} className={`${campo} w-24`} /></label>
          <button className={boton}>Guardar ajustes</button>
        </form>
        <p className="text-xs text-slate-500">El plazo de respuesta se aplica solo a los servicios nuevos; los ya creados conservan el suyo.</p>
      </section>

      <section className="space-y-2">
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
