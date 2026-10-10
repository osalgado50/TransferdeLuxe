import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import CamposNuevoVehiculo from "@/components/central/CamposNuevoVehiculo";
import GestionFavoritos from "@/components/central/GestionFavoritos";
import type { Favorito } from "@/lib/dominio/favoritos";
import { guardarVehiculo, guardarConductor, guardarAjustes } from "./actions";

const campo = "rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm";
const rejilla = "grid grid-cols-[7rem_10rem_4rem_4rem_7rem_7rem_6rem] items-center gap-2";
const boton = "rounded bg-marca px-3 py-1 text-sm font-medium text-white hover:bg-marca-oscuro";

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
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className={`${rejilla} text-sm text-slate-400`}>
              <span>Matrícula</span><span>Modelo</span><span>Plazas</span><span>Maletas</span><span>Estado</span><span>Km</span><span />
            </div>
            {(vehiculos ?? []).map((v) => (
              <form key={v.id} action={guardarVehiculo} className={`${rejilla} border-t border-slate-700 py-1`}>
                <input type="hidden" name="id" value={v.id} />
                <input name="matricula" defaultValue={v.matricula} aria-label="Matrícula" className={campo} />
                <input name="modelo" defaultValue={v.modelo} aria-label="Modelo" className={campo} />
                <input name="plazas" type="number" min={1} max={19} defaultValue={v.plazas} aria-label="Plazas" className={campo} />
                <input name="maletas" type="number" min={0} max={30} defaultValue={v.maletas} aria-label="Maletas" className={campo} />
                <select name="estado" defaultValue={v.estado} aria-label="Estado" className={campo}>
                  <option value="activo">Activo</option><option value="taller">En taller</option>
                </select>
                <input name="km_actuales" type="number" min={0} defaultValue={v.km_actuales} aria-label="Km" className={campo} />
                <button className={boton}>Guardar</button>
              </form>
            ))}
          </div>
        </div>
        <form action={guardarVehiculo} className="flex flex-wrap items-end gap-2 border-t border-slate-700 pt-2">
          <span className="py-1 text-sm text-slate-400">Nuevo:</span>
          <div className="flex flex-col gap-1"><label htmlFor="nv-matricula" className="text-xs text-slate-400">Matrícula</label><input id="nv-matricula" name="matricula" placeholder="Matrícula" required className={`${campo} w-28`} /></div>
          <div className="flex flex-col gap-1"><label htmlFor="nv-modelo" className="text-xs text-slate-400">Modelo</label><input id="nv-modelo" name="modelo" placeholder="Modelo" required className={`${campo} w-40`} /></div>
          <CamposNuevoVehiculo />
          <input type="hidden" name="estado" value="activo" />
          <div className="flex flex-col gap-1"><label htmlFor="nv-km" className="text-xs text-slate-400">Km</label><input id="nv-km" name="km_actuales" type="number" min={0} defaultValue={0} className={`${campo} w-28`} /></div>
          <button className={boton}>Añadir vehículo</button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Conductores</h2>
        {(conductores ?? []).map((c) => (
          <form key={c.id} action={guardarConductor} className="flex flex-wrap items-center gap-2 border-t border-slate-700 py-1">
            <input type="hidden" name="id" value={c.id} />
            <input name="nombre" defaultValue={c.nombre} aria-label="Nombre" className={`${campo} w-40`} />
            <span className="w-56 truncate text-sm text-slate-400" title={emails.get(c.id)}>{emails.get(c.id)}</span>
            <input name="telefono" defaultValue={c.telefono ?? ""} aria-label="Teléfono" className={`${campo} w-32`} />
            <select name="vehiculo_habitual_id" defaultValue={c.vehiculo_habitual_id ?? ""} aria-label="Vehículo habitual" className={campo}>
              <option value="">Sin vehículo</option>
              {(vehiculos ?? []).map((v) => <option key={v.id} value={v.id}>{v.matricula} · {v.modelo}{v.estado === "taller" ? " (taller)" : ""}</option>)}
            </select>
            <button className={boton}>Guardar</button>
          </form>
        ))}
        <form action={guardarConductor} className="flex flex-wrap items-end gap-2 border-t border-slate-700 pt-2">
          <span className="py-1 text-sm text-slate-400">Nuevo:</span>
          <div className="flex flex-col gap-1"><label htmlFor="nc-nombre" className="text-xs text-slate-400">Nombre</label><input id="nc-nombre" name="nombre" placeholder="Nombre" required className={`${campo} w-40`} /></div>
          <div className="flex flex-col gap-1"><label htmlFor="nc-email" className="text-xs text-slate-400">Email</label><input id="nc-email" name="email" type="email" placeholder="conductor@transferdeluxe.test" required className={`${campo} w-56`} /></div>
          <div className="flex flex-col gap-1"><label htmlFor="nc-telefono" className="text-xs text-slate-400">Teléfono</label><input id="nc-telefono" name="telefono" placeholder="Teléfono" className={`${campo} w-32`} /></div>
          <div className="flex flex-col gap-1"><label htmlFor="nc-vehiculo" className="text-xs text-slate-400">Vehículo</label><select id="nc-vehiculo" name="vehiculo_habitual_id" defaultValue="" className={campo}>
            <option value="">Sin vehículo</option>
            {(vehiculos ?? []).map((v) => <option key={v.id} value={v.id}>{v.matricula} · {v.modelo}</option>)}
          </select></div>
          {!demo && <input name="password" type="password" minLength={8} required placeholder="Contraseña (mín. 8)" aria-label="Contraseña nueva" className={`${campo} w-44`} />}
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
    </div>
  );
}
