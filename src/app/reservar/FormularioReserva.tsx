"use client";
import { useActionState, useState, useTransition } from "react";
import CampoDireccion from "@/components/comun/CampoDireccion";
import { avisoCapacidad, NOMBRE_TIPO } from "@/lib/dominio/capacidad";
import type { TipoVehiculo } from "@/lib/dominio/tipos";
import { leerDireccionForm, tieneCoordenadas, trayectoCompleto, type Favorito } from "@/lib/dominio/favoritos";
import { guardarFavoritoDireccion, guardarFavoritoTrayecto, type ResultadoFavorito } from "@/app/central/favoritos/actions";
import { reservar, type EstadoReserva } from "./actions";

type Accion = (prev: EstadoReserva, fd: FormData) => Promise<EstadoReserva>;
type Props = { accion?: Accion; modo?: "publico" | "central"; favoritos?: Favorito[] };
type Res = ResultadoFavorito & { aviso?: string };
type Valor = { texto: string; lat: string; lng: string };
const VACIO: Valor = { texto: "", lat: "", lng: "" };
type Relleno = { n: number; texto: string; lat: number | null; lng: number | null };

const VEHICULOS = [
  ["sedan", "Sedán (3 pax)"], ["minivan", "MiniVan (7 pax)"], ["minivan_premium", "MiniVan Premium (8 pax)"],
  ["microbus", "MicroBus (13 pax)"], ["minibus", "MiniBus (19 pax)"],
] as const;

const cls = "mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 focus:border-marca-claro focus:outline-none";
const seccion = "rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-4";

function ErrorCampo({ e, k }: { e?: Record<string, string[]>; k: string }) {
  return e?.[k]?.[0] ? <p className="mt-1 text-sm text-red-400">{e[k][0]}</p> : null;
}

export default function FormularioReserva({ accion = reservar, modo = "publico", favoritos = [] }: Props) {
  const [estado, enviar, pendiente] = useActionState<EstadoReserva, FormData>(accion, {});
  const [conVuelta, setConVuelta] = useState(false);
  const [pax, setPax] = useState(2);
  const [maletas, setMaletas] = useState(0);
  const [tipo, setTipo] = useState<TipoVehiculo>("sedan");
  const central = modo === "central";
  const [origen, setOrigen] = useState<Valor>(VACIO);
  const [destino, setDestino] = useState<Valor>(VACIO);
  const [rellenoO, setRellenoO] = useState<Relleno>();
  const [rellenoD, setRellenoD] = useState<Relleno>();
  const [avisoFav, setAvisoFav] = useState<Res & { texto: string }>();
  const [, empezar] = useTransition();
  const trayectos = favoritos.filter((f) => f.tipo === "trayecto");
  const direcciones = favoritos.filter((f) => f.tipo === "direccion");

  function elegirTrayecto(id: string) {
    const f = trayectos.find((x) => x.id === id);
    if (!f) return;
    const n = Date.now();
    setRellenoO({ n, texto: f.origen_texto, lat: f.origen_lat, lng: f.origen_lng });
    setRellenoD({ n, texto: f.destino_texto ?? "", lat: f.destino_lat, lng: f.destino_lng });
    if (f.pasajeros != null) setPax(f.pasajeros);
    if (f.maletas != null) setMaletas(f.maletas);
    if (f.tipo_vehiculo_pedido) setTipo(f.tipo_vehiculo_pedido);
  }
  function guardar(titulo: string, ejecutar: (nombre: string) => Promise<Res>) {
    const nombre = window.prompt(`Nombre corto para el favorito (${titulo})`);
    if (nombre == null) return;
    empezar(async () => {
      const r = await ejecutar(nombre);
      setAvisoFav({ ...r, texto: r.ok ? (r.aviso ?? "Favorito guardado") : r.error });
    });
  }
  // Las coordenadas se leen de los inputs ocultos del formulario en el momento del clic (igual que el envío).
  const guardarDireccion = (campo: "origen" | "destino", form: HTMLFormElement | null) => {
    const v = form ? leerDireccionForm(new FormData(form), campo) : (campo === "origen" ? origen : destino);
    guardar("dirección", async (nombre) => {
      const r = await guardarFavoritoDireccion({ nombre, texto: v.texto, lat: v.lat, lng: v.lng });
      return r.ok && !tieneCoordenadas(v) ? { ...r, aviso: "Favorito guardado sin coordenadas (elige una sugerencia para incluirlas)" } : r;
    });
  };
  const guardarTrayecto = (form: HTMLFormElement | null) => {
    const fd = form ? new FormData(form) : null;
    const o = fd ? leerDireccionForm(fd, "origen") : origen, d = fd ? leerDireccionForm(fd, "destino") : destino;
    guardar("trayecto", async (nombre) => {
      const r = await guardarFavoritoTrayecto({
        nombre, origen_texto: o.texto, origen_lat: o.lat, origen_lng: o.lng,
        destino_texto: d.texto, destino_lat: d.lat, destino_lng: d.lng, pasajeros: pax, maletas, tipo_vehiculo_pedido: tipo,
      });
      return r.ok && !(tieneCoordenadas(o) && tieneCoordenadas(d)) ? { ...r, aviso: "Trayecto guardado sin coordenadas en algún extremo (elige sugerencias para incluirlas)" } : r;
    });
  };
  const botonFav = (campo: "origen" | "destino", v: Valor) => central ? (
    <button type="button" disabled={!v.texto.trim()} onClick={(e) => guardarDireccion(campo, e.currentTarget.form)}
      className="rounded border border-slate-600 px-2 py-0.5 text-xs text-amber-300 hover:bg-slate-800 disabled:opacity-40">⭐ Guardar en favoritos</button>
  ) : undefined;
  const aviso = avisoCapacidad(tipo, pax, maletas);
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
        {central && trayectos.length > 0 && (
          <label className="block text-sm font-medium">Trayectos favoritos
            <select defaultValue="" onChange={(e) => { elegirTrayecto(e.target.value); e.target.value = ""; }} className={cls}>
              <option value="">Elegir un trayecto favorito…</option>
              {trayectos.map((f) => <option key={f.id} value={f.id}>⭐ {f.nombre} — {f.origen_texto} → {f.destino_texto}</option>)}
            </select>
          </label>
        )}
        <CampoDireccion name="origen" etiqueta="Dirección de recogida" requerido error={err("origen_texto")}
          favoritos={central ? direcciones : undefined} rellenar={rellenoO} onCambio={setOrigen} extra={botonFav("origen", origen)} />
        <CampoDireccion name="destino" etiqueta="Dirección de destino" requerido error={err("destino_texto")}
          favoritos={central ? direcciones : undefined} rellenar={rellenoD} onCambio={setDestino} extra={botonFav("destino", destino)} />
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-medium">Fecha de recogida
            <input type="date" name="fecha" required className={cls} /><ErrorCampo e={estado.errores} k="fecha" /></label>
          <label className="block text-sm font-medium">Hora de recogida
            <input type="time" name="hora" required className={cls} /><ErrorCampo e={estado.errores} k="hora" /></label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-sm font-medium">Pasajeros
            <select name="pasajeros" value={pax} onChange={(e) => setPax(Number(e.target.value))} className={cls}>{numeros(1, 19).map((n) => <option key={n} value={n}>{n}</option>)}</select>
            <ErrorCampo e={estado.errores} k="pasajeros" /></label>
          <label className="block text-sm font-medium">Maletas
            <select name="maletas" value={maletas} onChange={(e) => setMaletas(Number(e.target.value))} className={cls}>{numeros(0, 19).map((n) => <option key={n} value={n}>{n}</option>)}</select>
            <ErrorCampo e={estado.errores} k="maletas" /></label>
        </div>
        <label className="block text-sm font-medium">Tipo de vehículo
          <select name="tipo_vehiculo_pedido" value={tipo} onChange={(e) => setTipo(e.target.value as TipoVehiculo)} className={cls}>
            {VEHICULOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
          {aviso ? (
            <p role="alert" data-aviso="capacidad" className="mt-1 text-sm text-red-400">{aviso.mensaje}
              {aviso.sugerido && <> <button type="button" onClick={() => setTipo(aviso.sugerido!)} className="ml-1 rounded border border-red-400 px-2 py-0.5 text-red-300 hover:bg-red-950">Usar {NOMBRE_TIPO[aviso.sugerido]}</button></>}
            </p>
          ) : <ErrorCampo e={estado.errores} k="tipo_vehiculo_pedido" />}</label>
        <label className="block text-sm font-medium">Número de vuelo
          <input type="text" name="numero_vuelo" className={cls} /></label>
        {central && trayectoCompleto({ origen_texto: origen.texto, destino_texto: destino.texto }) && (
          <button type="button" onClick={(e) => guardarTrayecto(e.currentTarget.form)}
            className="rounded border border-slate-600 px-3 py-1 text-sm text-amber-300 hover:bg-slate-800">⭐ Guardar trayecto como favorito</button>
        )}
        {central && avisoFav && <p role="status" className={`text-sm ${avisoFav.ok ? "text-emerald-300" : "text-red-400"}`}>{avisoFav.texto}</p>}
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
