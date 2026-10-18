"use client";
import { startTransition, useActionState, useRef, useState, useTransition, type FormEvent } from "react";
import CampoDireccion from "@/components/comun/CampoDireccion";
import EnlacePrivacidad from "@/components/legal/EnlacePrivacidad";
import { avisoCapacidad, NOMBRE_TIPO } from "@/lib/dominio/capacidad";
import type { TipoVehiculo } from "@/lib/dominio/tipos";
import type { LugarEmpresa } from "@/lib/dominio/lugaresEmpresa";
import { leerDireccionForm, tieneCoordenadas, trayectoCompleto, type Favorito } from "@/lib/dominio/favoritos";
import { guardarFavoritoDireccion, guardarFavoritoTrayecto, type ResultadoFavorito } from "@/app/central/favoritos/actions";
import { reservar, type EstadoReserva, type HoraLibre } from "./actions";
import { enlaceLlamar, enlaceWhatsApp, horaMinima, sinAntelacion } from "@/lib/reserva/disponibilidad";

type Accion = (prev: EstadoReserva, fd: FormData) => Promise<EstadoReserva>;
type Props = { accion?: Accion; modo?: "publico" | "central"; favoritos?: Favorito[]; lugaresEmpresa?: LugarEmpresa[]; vuelos?: boolean };
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

export default function FormularioReserva({ accion = reservar, modo = "publico", favoritos = [], lugaresEmpresa = [], vuelos = true }: Props) {
  // Si la web se ha actualizado mientras se rellenaba (la acción del servidor ya no existe), aviso en vez de romperse.
  const [estado, enviar, pendiente] = useActionState<EstadoReserva & { actualizada?: boolean }, FormData>(async (prev, fd) => {
    try { return await accion(prev, fd); } catch { return { actualizada: true }; }
  }, {});
  const [fecha, setFecha] = useState("");
  const [horaLocal, setHoraLocal] = useState<string | null>(null);
  const [verHueco, setVerHueco] = useState(true);
  const ultimo = useRef<FormData | null>(null);
  // Se envía a mano (no con action=): así, si hay un error, el formulario conserva lo escrito.
  const enviarForm = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (modo === "publico" && sinAntelacion(String(fd.get("fecha")), String(fd.get("hora")), Date.now())) {
      setHoraLocal("Reserva con al menos media hora de antelación. Si es más urgente, llámanos."); return;
    }
    setHoraLocal(null); setVerHueco(true);
    ultimo.current = fd;
    startTransition(() => enviar(fd));
  };
  // Otra hora con coche libre: la misma reserva (ida y vuelta movidas lo mismo), que el servidor vuelve a comprobar.
  const reservarA = (h: HoraLibre) => {
    if (!ultimo.current) return;
    const fd = new FormData(); ultimo.current.forEach((v, k) => fd.append(k, v)); fd.set("fecha", h.fecha); fd.set("hora", h.hora);
    if (h.vuelta) { fd.set("vuelta_fecha", h.vuelta.fecha); fd.set("vuelta_hora", h.vuelta.hora); }
    ultimo.current = fd;
    startTransition(() => enviar(fd));
  };
  const enviarIgualmente = () => {
    if (!ultimo.current) return;
    const fd = new FormData(); ultimo.current.forEach((v, k) => fd.append(k, v)); fd.set("forzar", "1");
    startTransition(() => enviar(fd));
  };
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
        <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row">
          {/* Recarga completa a propósito: formulario limpio con favoritos y ajustes al día. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href={central ? "/central/servicios/nuevo" : "/reservar"} className="min-h-12 rounded-lg bg-marca px-5 py-3 font-semibold text-white hover:bg-marca-claro">
            {central ? "Crear otro servicio" : "Hacer otra reserva"}
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          {central && <a href="/central/servicios" className="min-h-12 rounded-lg border border-slate-600 px-5 py-3 font-semibold hover:border-marca-claro">Ver servicios</a>}
        </div>
      </div>
    );
  }

  const numeros = (desde: number, hasta: number) => Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);

  return (
    <form onSubmit={enviarForm} className="space-y-6 text-slate-200">
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
        <CampoDireccion name="origen" conUbicacion etiqueta="Dirección de recogida" requerido error={err("origen_texto")}
          favoritos={central ? direcciones : undefined} lugaresEmpresa={central ? lugaresEmpresa : undefined} rellenar={rellenoO} onCambio={setOrigen} extra={botonFav("origen", origen)} />
        <CampoDireccion name="destino" etiqueta="Dirección de destino" requerido error={err("destino_texto")}
          favoritos={central ? direcciones : undefined} lugaresEmpresa={central ? lugaresEmpresa : undefined} rellenar={rellenoD} onCambio={setDestino} extra={botonFav("destino", destino)} />
        <div className="grid grid-cols-2 gap-4">
          <label className="block min-w-0 text-sm font-medium">Fecha de recogida
            <input type="date" name="fecha" required value={fecha} onChange={(e) => { setFecha(e.target.value); setHoraLocal(null); }} className={cls} /><ErrorCampo e={estado.errores} k="fecha" /></label>
          <label className="block min-w-0 text-sm font-medium">Hora de recogida
            <input type="time" name="hora" required min={modo === "publico" ? horaMinima(fecha, Date.now()) : undefined} onChange={() => setHoraLocal(null)} className={cls} />
            {horaLocal ? <p className="mt-1 text-sm text-red-400">{horaLocal}</p> : <ErrorCampo e={estado.errores} k="hora" />}</label>
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
        {vuelos && <label className="block text-sm font-medium">Número de vuelo <span className="text-slate-400">(opcional)</span>
          <input type="text" name="numero_vuelo" maxLength={10} placeholder="FR1234" autoCapitalize="characters" className={cls} />
          <ErrorCampo e={estado.errores} k="numero_vuelo" /></label>}
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
          <CampoDireccion name="vuelta_origen" etiqueta="Recogida de la vuelta" requerido error={err("vuelta_origen_texto")}
            favoritos={central ? direcciones : undefined} lugaresEmpresa={central ? lugaresEmpresa : undefined} />
          <CampoDireccion name="vuelta_destino" etiqueta="Destino de la vuelta" requerido error={err("vuelta_destino_texto")}
            favoritos={central ? direcciones : undefined} lugaresEmpresa={central ? lugaresEmpresa : undefined} />
          <div className="grid grid-cols-2 gap-4">
            <label className="block min-w-0 text-sm font-medium">Fecha de la vuelta
              <input type="date" name="vuelta_fecha" required className={cls} /><ErrorCampo e={estado.errores} k="vuelta_fecha" /></label>
            <label className="block min-w-0 text-sm font-medium">Hora de la vuelta
              <input type="time" name="vuelta_hora" required className={cls} /><ErrorCampo e={estado.errores} k="vuelta_hora" /></label>
          </div>
          {vuelos && <label className="block text-sm font-medium">Número de vuelo de la vuelta <span className="text-slate-400">(opcional)</span>
            <input type="text" name="vuelta_numero_vuelo" maxLength={10} placeholder="VY8120" autoCapitalize="characters" className={cls} />
            <ErrorCampo e={estado.errores} k="vuelta_numero_vuelo" /></label>}
        </section>
      )}

      <section className={seccion}>
        <h2 className="text-lg font-semibold text-marca-claro">{central ? "Datos del cliente" : "Tus datos"}</h2>
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
            <span>Al reservar aceptas la <EnlacePrivacidad className="text-marca-claro underline">política de privacidad</EnlacePrivacidad>. He leído y la acepto.</span>
          </label>
          <ErrorCampo e={estado.errores} k="acepta_privacidad" />
          <p className="text-xs text-slate-400">Te avisaremos del estado de tu traslado por WhatsApp o SMS (conductor en camino, retrasos y llegada), con un enlace para seguir el coche en directo.</p>
          <input type="text" name="web" className="hidden" tabIndex={-1} autoComplete="off" />
        </div>
      )}

      {estado.mensaje && !estado.sinHueco && <p role="alert" className="text-sm text-red-400">{estado.mensaje}</p>}
      {estado.actualizada && (
        <div role="alert" className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-100">
          <p>Hemos actualizado la web mientras rellenabas el formulario. Recarga la página y vuelve a enviarlo.</p>
          <button type="button" onClick={() => location.reload()} className="min-h-11 rounded-lg bg-amber-400 px-4 font-semibold text-slate-950">Recargar la página</button>
        </div>
      )}
      {estado.sinHueco && verHueco && !pendiente && (() => {
        const u = ultimo.current;
        const texto = u ? `Hola, quiero un traslado el ${String(u.get("fecha")).split("-").reverse().join("/")} a las ${u.get("hora")} de ${u.get("origen_texto")} a ${u.get("destino_texto")} (${u.get("pasajeros")} pasajeros). ¿Tenéis disponibilidad?` : "";
        const wa = enlaceWhatsApp(estado.contacto?.whatsapp ?? estado.contacto?.telefono, texto);
        const tel = enlaceLlamar(estado.contacto?.telefono ?? estado.contacto?.whatsapp);
        return (
          <div role="alert" className="space-y-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4">
            <p className="text-lg font-semibold text-amber-200">A esa hora tenemos todos los coches ocupados</p>
            <p className="text-sm text-slate-300">Escríbenos o llámanos y te buscamos una solución, o elige otra hora.</p>
            {!!estado.alternativas?.length && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-white">Tenemos coche libre a estas horas:</p>
                <div className="flex flex-wrap gap-2">
                  {estado.alternativas.map((h) => (
                    <button key={`${h.fecha}${h.hora}`} type="button" onClick={() => reservarA(h)} data-alternativa={h.hora}
                      className="min-h-12 rounded-lg bg-marca px-4 font-semibold text-white hover:bg-marca-claro">Reservar a las {h.hora}{h.vuelta ? ` (vuelta ${h.vuelta.hora})` : ""}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center rounded-lg bg-emerald-600 font-semibold text-white">💬 Escribir por WhatsApp</a>}
              {tel && <a href={tel} className="flex min-h-12 items-center justify-center rounded-lg border border-slate-500 font-semibold">📞 Llamar a la central</a>}
              <button type="button" onClick={() => setVerHueco(false)} className="min-h-12 rounded-lg border border-slate-600">Elegir otra hora</button>
              <button type="button" onClick={enviarIgualmente} className="min-h-12 rounded-lg text-sm text-slate-300 underline">Enviar la solicitud igualmente</button>
            </div>
          </div>
        );
      })()}
      <button type="submit" disabled={pendiente}
        className="w-full rounded-lg bg-marca px-6 py-3 font-semibold text-white hover:bg-marca-oscuro disabled:opacity-60">
        {pendiente ? "Enviando…" : central ? "Crear servicio" : "Reservar"}
      </button>
    </form>
  );
}
