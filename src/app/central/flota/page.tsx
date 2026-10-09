import { exigirRol } from "@/lib/supabase/sesion";
import { clienteAdmin } from "@/lib/supabase/admin";
import { guardarVehiculo, guardarConductor, guardarAjustes } from "./actions";

const campo = "rounded border border-slate-600 bg-slate-900 px-2 py-1 text-sm";
const boton = "rounded bg-amber-500 px-3 py-1 text-sm font-medium text-slate-900 hover:bg-amber-400";

export default async function Flota({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirRol("operador");
  const f = await searchParams;
  const sb = clienteAdmin();
  const [{ data: vehiculos }, { data: conductores }, { data: ajustes }, { data: usuarios }] = await Promise.all([
    sb.from("vehiculos").select("*").order("matricula"),
    sb.from("perfiles").select("*").eq("rol", "conductor").order("nombre"),
    sb.from("ajustes").select("*").eq("id", 1).single(),
    sb.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const emails = new Map((usuarios?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  const demo = process.env.NEXT_PUBLIC_MODO_DEMO === "true";
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-amber-400">Flota y ajustes</h1>
      {f.error && <p role="alert" className="rounded bg-red-900/50 p-2 text-red-200">{f.error}</p>}
      {f.ok && <p role="status" className="rounded bg-emerald-900/50 p-2 text-emerald-200">Cambios guardados</p>}
      <p className="rounded border border-slate-700 p-2 text-sm text-slate-400">Mantenimiento (aceite, neumáticos, ITV): próximamente</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Vehículos</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400"><tr><th>Matrícula</th><th>Modelo</th><th>Plazas</th><th>Estado</th><th>Km</th><th /></tr></thead>
            <tbody>
              {(vehiculos ?? []).map((v) => (
                <tr key={v.id} className="border-t border-slate-700">
                  <td colSpan={6}>
                    <form action={guardarVehiculo} className="flex flex-wrap items-center gap-2 py-1">
                      <input type="hidden" name="id" value={v.id} />
                      <input name="matricula" defaultValue={v.matricula} aria-label="Matrícula" className={`${campo} w-28`} />
                      <input name="modelo" defaultValue={v.modelo} aria-label="Modelo" className={`${campo} w-40`} />
                      <input name="plazas" type="number" min={1} max={19} defaultValue={v.plazas} aria-label="Plazas" className={`${campo} w-16`} />
                      <select name="estado" defaultValue={v.estado} aria-label="Estado" className={campo}>
                        <option value="activo">Activo</option><option value="taller">En taller</option>
                      </select>
                      <input name="km_actuales" type="number" min={0} defaultValue={v.km_actuales} aria-label="Km" className={`${campo} w-28`} />
                      <button className={boton}>Guardar</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={guardarVehiculo} className="flex flex-wrap items-center gap-2 border-t border-slate-700 pt-2">
          <span className="text-sm text-slate-400">Nuevo:</span>
          <input name="matricula" placeholder="Matrícula" aria-label="Matrícula nueva" required className={`${campo} w-28`} />
          <input name="modelo" placeholder="Modelo" aria-label="Modelo nuevo" required className={`${campo} w-40`} />
          <input name="plazas" type="number" min={1} max={19} defaultValue={4} aria-label="Plazas nuevo" className={`${campo} w-16`} />
          <input type="hidden" name="estado" value="activo" />
          <input name="km_actuales" type="number" min={0} defaultValue={0} aria-label="Km nuevo" className={`${campo} w-28`} />
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
        <form action={guardarConductor} className="flex flex-wrap items-center gap-2 border-t border-slate-700 pt-2">
          <span className="text-sm text-slate-400">Nuevo:</span>
          <input name="nombre" placeholder="Nombre" aria-label="Nombre nuevo" required className={`${campo} w-40`} />
          <input name="email" type="email" placeholder="conductor@transferdeluxe.test" aria-label="Email nuevo" required className={`${campo} w-56`} />
          <input name="telefono" placeholder="Teléfono" aria-label="Teléfono nuevo" className={`${campo} w-32`} />
          <select name="vehiculo_habitual_id" aria-label="Vehículo habitual nuevo" defaultValue="" className={campo}>
            <option value="">Sin vehículo</option>
            {(vehiculos ?? []).map((v) => <option key={v.id} value={v.id}>{v.matricula} · {v.modelo}</option>)}
          </select>
          {!demo && <input name="password" type="password" minLength={8} required placeholder="Contraseña (mín. 8)" aria-label="Contraseña nueva" className={`${campo} w-44`} />}
          <button className={boton}>Añadir conductor</button>
        </form>
        {demo && <p className="text-xs text-slate-500">Modo demo: el conductor nuevo usa la contraseña de demo.</p>}
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
