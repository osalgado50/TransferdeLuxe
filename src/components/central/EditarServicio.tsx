"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CampoDireccion from "@/components/comun/CampoDireccion";
import { NOMBRE_TIPO } from "@/lib/dominio/capacidad";
import type { TipoVehiculo } from "@/lib/dominio/tipos";
import type { DatosEdicion } from "@/lib/dominio/edicionServicio";
import { editarServicio, type EstadoEdicion } from "@/app/central/servicios/editar-actions";

const cls = "mt-1 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white";
const etq = "block text-sm font-medium text-slate-200";

/**
 * «✏️ Editar servicio» en la ficha: la central cambia la hora, las direcciones, los pasajeros, el vehículo, el vuelo, el
 * cliente o las notas, en cualquier estado. Se guarda en el historial y, si tiene conductor, se le avisa.
 */
export default function EditarServicio({ servicioId, s, fechaLocal }: { servicioId: string; s: DatosEdicion; fechaLocal: string }) {
  const [estado, enviar, pend] = useActionState<EstadoEdicion, FormData>(editarServicio, {});
  const [abierto, setAbierto] = useState(false);
  const router = useRouter();
  // Las direcciones arrancan con su texto y coordenadas (si no se tocan, no cambia el trayecto).
  const [inicio] = useState(() => ({
    origen: { n: 1, texto: s.origen_texto, lat: s.origen_lat, lng: s.origen_lng },
    destino: { n: 1, texto: s.destino_texto, lat: s.destino_lat, lng: s.destino_lng },
  }));
  const ultimo = useRef(estado);
  useEffect(() => {
    if (estado === ultimo.current) return;
    ultimo.current = estado;
    if (estado.ok) { setAbierto(false); router.refresh(); }
  }, [estado, router]);
  const err = (k: string) => estado.errores?.[k]?.[0] ? <span className="mt-1 block text-xs text-red-400">{estado.errores[k][0]}</span> : null;

  return (
    <details open={abierto} onToggle={(e) => setAbierto(e.currentTarget.open)} className="rounded-xl border border-slate-800 bg-slate-900/60">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-semibold text-marca-claro">
        ✏️ Editar servicio <span className="font-normal text-slate-400">· hora, direcciones, pasajeros, cliente…</span>
        {estado.ok && estado.mensaje && !abierto && <span role="status" className="ml-auto text-xs font-normal text-green-300">{estado.mensaje}</span>}
      </summary>
      <form action={enviar} className="grid gap-4 border-t border-slate-800 p-4 sm:grid-cols-2">
        <input type="hidden" name="servicioId" value={servicioId} />
        <label className={etq}>Fecha<input type="date" name="fecha" required defaultValue={fechaLocal.slice(0, 10)} className={cls} />{err("fecha")}</label>
        <label className={etq}>Hora de recogida<input type="time" name="hora" required defaultValue={fechaLocal.slice(11, 16)} className={cls} />{err("hora")}</label>
        <div className="sm:col-span-2"><CampoDireccion name="origen" etiqueta="Recogida" requerido rellenar={inicio.origen} error={estado.errores?.origen_texto?.[0]} claseInput={cls} /></div>
        <div className="sm:col-span-2"><CampoDireccion name="destino" etiqueta="Destino" requerido rellenar={inicio.destino} error={estado.errores?.destino_texto?.[0]} claseInput={cls} /></div>
        <label className={etq}>Pasajeros<input type="number" name="pasajeros" min={1} max={19} required defaultValue={s.pasajeros} className={cls} />{err("pasajeros")}</label>
        <label className={etq}>Maletas<input type="number" name="maletas" min={0} max={19} required defaultValue={s.maletas} className={cls} />{err("maletas")}</label>
        <label className={etq}>Vehículo
          <select name="tipo_vehiculo_pedido" defaultValue={s.tipo_vehiculo_pedido} className={cls}>
            {(Object.keys(NOMBRE_TIPO) as TipoVehiculo[]).map((t) => <option key={t} value={t}>{NOMBRE_TIPO[t]}</option>)}
          </select>{err("tipo_vehiculo_pedido")}</label>
        <label className={etq}>Nº de vuelo<input name="numero_vuelo" defaultValue={s.numero_vuelo ?? ""} className={cls} />{err("numero_vuelo")}</label>
        <label className={etq}>Nombre del cliente<input name="cliente_nombre" required defaultValue={s.cliente_nombre} className={cls} />{err("cliente_nombre")}</label>
        <label className={etq}>Apellidos<input name="cliente_apellidos" defaultValue={s.cliente_apellidos ?? ""} className={cls} /></label>
        <label className={etq}>Teléfono<input type="tel" name="cliente_telefono" required defaultValue={s.cliente_telefono} className={cls} />{err("cliente_telefono")}</label>
        <label className={etq}>Correo<input type="email" name="cliente_email" required defaultValue={s.cliente_email} className={cls} />{err("cliente_email")}</label>
        <label className={`${etq} sm:col-span-2`}>Notas<textarea name="notas" rows={2} defaultValue={s.notas ?? ""} className={`${cls} py-2`} /></label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={pend} className="min-h-11 rounded-lg bg-marca px-5 font-semibold text-white hover:bg-marca-claro disabled:opacity-50">
            {pend ? "Guardando…" : "Guardar cambios"}</button>
          <button type="button" onClick={() => setAbierto(false)} className="min-h-11 rounded-lg border border-slate-600 px-4 text-sm text-slate-300">Cerrar</button>
          {estado.mensaje && <span role={estado.ok ? "status" : "alert"} className={`text-sm ${estado.ok ? "text-green-300" : "text-red-400"}`}>{estado.mensaje}</span>}
        </div>
        <p className="text-xs text-slate-400 sm:col-span-2">Si el servicio tiene conductor, recibe un aviso con lo que ha cambiado. Todo queda en el historial.</p>
      </form>
    </details>
  );
}
