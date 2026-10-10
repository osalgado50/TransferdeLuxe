"use client";
import { useActionState, useState } from "react";
import CampoDireccion from "@/components/comun/CampoDireccion";
import { reservar, type EstadoReserva } from "./actions";

type Accion = (prev: EstadoReserva, fd: FormData) => Promise<EstadoReserva>;
type Props = { accion?: Accion; modo?: "publico" | "central" };

const VEHICULOS = [
  ["sedan", "Sedán (3 pax)"], ["minivan", "MiniVan (7 pax)"], ["minivan_premium", "MiniVan Premium (8 pax)"],
  ["microbus", "MicroBus (13 pax)"], ["minibus", "MiniBus (19 pax)"],
] as const;

const cls = "mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 focus:border-marca-claro focus:outline-none";
const seccion = "rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4";

function ErrorCampo({ e, k }: { e?: Record<string, string[]>; k: string }) {
  return e?.[k]?.[0] ? <p className="mt-1 text-sm text-red-400">{e[k][0]}</p> : null;
}

export default function FormularioReserva({ accion = reservar, modo = "publico" }: Props) {
  const [estado, enviar, pendiente] = useActionState<EstadoReserva, FormData>(accion, {});
  const [conVuelta, setConVuelta] = useState(false);
  const err = (k: string) => estado.errores?.[k]?.[0];

  if (estado.ok) {
    return (
      <div role="status" className="rounded-xl border border-marca-claro bg-slate-900 p-6 text-center">
        <p className="text-xl font-semibold text-marca-claro">{estado.mensaje}</p>
      </div>
    );
  }

  const numeros = (desde: number, hasta: number) => Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);

  return (
    <form action={enviar} className="space-y-6 text-slate-200">
      <section className={seccion}>
        <h2 className="text-lg font-semibold text-marca-claro">Trayecto</h2>
        <CampoDireccion name="origen" etiqueta="Dirección de recogida" requerido error={err("origen_texto")} />
        <CampoDireccion name="destino" etiqueta="Dirección de destino" requerido error={err("destino_texto")} />
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-medium">Fecha de recogida
            <input type="date" name="fecha" required className={cls} /><ErrorCampo e={estado.errores} k="fecha" /></label>
          <label className="block text-sm font-medium">Hora de recogida
            <input type="time" name="hora" required className={cls} /><ErrorCampo e={estado.errores} k="hora" /></label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-medium">Pasajeros
            <select name="pasajeros" defaultValue="2" className={cls}>{numeros(1, 19).map((n) => <option key={n} value={n}>{n}</option>)}</select>
            <ErrorCampo e={estado.errores} k="pasajeros" /></label>
          <label className="block text-sm font-medium">Maletas
            <select name="maletas" defaultValue="0" className={cls}>{numeros(0, 19).map((n) => <option key={n} value={n}>{n}</option>)}</select>
            <ErrorCampo e={estado.errores} k="maletas" /></label>
        </div>
        <label className="block text-sm font-medium">Tipo de vehículo
          <select name="tipo_vehiculo_pedido" defaultValue="sedan" className={cls}>
            {VEHICULOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select><ErrorCampo e={estado.errores} k="tipo_vehiculo_pedido" /></label>
        <label className="block text-sm font-medium">Número de vuelo
          <input type="text" name="numero_vuelo" className={cls} /></label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="con_vuelta" checked={conVuelta} onChange={(e) => setConVuelta(e.target.checked)} className="size-4 accent-marca-claro" />
          Añadir vuelta
        </label>
      </section>

      {conVuelta && (
        <section className={seccion}>
          <h2 className="text-lg font-semibold text-marca-claro">Vuelta</h2>
          <CampoDireccion name="vuelta_origen" etiqueta="Recogida de la vuelta" requerido error={err("vuelta_origen_texto")} />
          <CampoDireccion name="vuelta_destino" etiqueta="Destino de la vuelta" requerido error={err("vuelta_destino_texto")} />
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm font-medium">Fecha de la vuelta
              <input type="date" name="vuelta_fecha" required className={cls} /><ErrorCampo e={estado.errores} k="vuelta_fecha" /></label>
            <label className="block text-sm font-medium">Hora de la vuelta
              <input type="time" name="vuelta_hora" required className={cls} /><ErrorCampo e={estado.errores} k="vuelta_hora" /></label>
          </div>
          <label className="block text-sm font-medium">Número de vuelo de la vuelta
            <input type="text" name="vuelta_numero_vuelo" className={cls} /></label>
        </section>
      )}

      <section className={seccion}>
        <h2 className="text-lg font-semibold text-marca-claro">Tus datos</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">Nombre
            <input type="text" name="cliente_nombre" required className={cls} /><ErrorCampo e={estado.errores} k="cliente_nombre" /></label>
          <label className="block text-sm font-medium">Apellidos
            <input type="text" name="cliente_apellidos" className={cls} /></label>
          <label className="block text-sm font-medium">Email
            <input type="email" name="cliente_email" required className={cls} /><ErrorCampo e={estado.errores} k="cliente_email" /></label>
          <label className="block text-sm font-medium">Teléfono
            <input type="tel" name="cliente_telefono" required className={cls} /><ErrorCampo e={estado.errores} k="cliente_telefono" /></label>
        </div>
        <label className="block text-sm font-medium">Información adicional
          <textarea name="notas" rows={3} className={cls} /></label>
      </section>

      {modo === "publico" && (
        <div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="acepta_privacidad" required className="mt-0.5 size-4 accent-marca-claro" />
            He leído y acepto la política de privacidad
          </label>
          <ErrorCampo e={estado.errores} k="acepta_privacidad" />
          <input type="text" name="web" className="hidden" tabIndex={-1} autoComplete="off" />
        </div>
      )}

      {estado.mensaje && <p role="alert" className="text-sm text-red-400">{estado.mensaje}</p>}
      <button type="submit" disabled={pendiente}
        className="w-full rounded-lg bg-marca px-6 py-3 font-semibold text-white hover:bg-marca-oscuro disabled:opacity-60">
        {pendiente ? "Enviando…" : "Reservar"}
      </button>
    </form>
  );
}
