"use client";
import { useEffect, useRef, useState } from "react";
import { avisoClienteEnviado, datosAvisoCliente } from "@/app/conductor/actions";
import { avisoClienteCentral, datosAvisoCentral } from "@/app/central/aviso-actions";
import { EVENTO_ETA, type DetalleEta } from "@/components/conductor/ContadorPuntualidad";
import {
  BOTON_AVISO, enlaceSms, enlaceWhatsApp, estimacionAviso, mensajeAviso, normalizarTelefono, type CanalAviso, type TipoAviso,
} from "@/lib/dominio/avisoCliente";

interface Datos { ruta: string | null; conductor: string | null; modelo: string | null; matricula: string | null }
const MINUTOS = [5, 10, 15, 20, 30];

/**
 * Botón verde «💬 Avisar al cliente» y hoja con los avisos (en camino con la ETA del mapa, retraso con los minutos del
 * contador de puntualidad, ya estoy aquí, cambio de conductor). Abre WhatsApp (wa.me) o SMS con el texto escrito y,
 * después, anota el aviso en la actividad. `modo`: PWA del conductor o ficha de la central.
 */
export default function AvisoCliente({ servicioId, estado, recogida, telefono, cliente, tipos, modo, conductorNombre, abiertoInicial, etiqueta }: {
  servicioId: string; estado: string; recogida: string; telefono: string | null; cliente: string | null; tipos: TipoAviso[];
  modo: "conductor" | "central"; conductorNombre?: string | null; abiertoInicial?: boolean; etiqueta?: string;
}) {
  const [abierto, setAbierto] = useState(!!abiertoInicial);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [etaS, setEtaS] = useState<number | null>(null);
  const [retraso, setRetraso] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const pedido = useRef(false);

  useEffect(() => {
    const f = (e: Event) => { const d = (e as CustomEvent<DetalleEta>).detail; if (d?.servicioId === servicioId) setEtaS(d.etaS); };
    window.addEventListener(EVENTO_ETA, f);
    return () => window.removeEventListener(EVENTO_ETA, f);
  }, [servicioId]);
  useEffect(() => {
    if (!abierto || pedido.current) return;
    pedido.current = true;
    (modo === "central" ? datosAvisoCentral(servicioId) : datosAvisoCliente(servicioId))
      .then((r) => { if (r.ok) setDatos(r); else pedido.current = false; })
      .catch(() => { pedido.current = false; }); // sin red: el mensaje sale sin enlace
  }, [abierto, modo, servicioId]);

  if (!tipos.length) return null;
  const tel = normalizarTelefono(telefono);
  const est = estimacionAviso({ estado, recogida, ahora: Date.now(), etaS });
  const enlace = datos?.ruta ? `${window.location.origin}${datos.ruta}` : null;
  const texto = (tipo: TipoAviso) => {
    const min = tipo === "retraso" ? (retraso ?? est.minutos ?? 10) : null;
    const hora = tipo === "retraso" && !est.minutos && min
      ? new Date(Math.max(Date.now(), Date.parse(recogida)) + min * 60_000).toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" })
      : est.hora;
    return mensajeAviso(tipo, {
      cliente, conductor: datos?.conductor ?? conductorNombre ?? null, hora, minutos: min, enlace,
      modelo: datos?.modelo, matricula: datos?.matricula, emisor: modo,
    });
  };
  const enviar = (tipo: TipoAviso, canal: CanalAviso) => {
    const t = texto(tipo);
    const url = canal === "whatsapp" ? enlaceWhatsApp(telefono, t) : enlaceSms(telefono, t);
    if (!url) { setAviso("El teléfono del cliente no es válido."); return; }
    if (canal === "whatsapp") window.open(url, "_blank", "noopener"); else window.location.href = url;
    // Tras abrir: se anota en la actividad (idempotente; un reintento si falla la red).
    const p = { idAccion: crypto.randomUUID(), servicioId, tipo, canal };
    const anotar = () => (modo === "central" ? avisoClienteCentral(p) : avisoClienteEnviado(p));
    anotar().catch(() => new Promise((ok) => setTimeout(ok, 5000)).then(anotar)).catch(() => {});
    setAviso(canal === "whatsapp" ? "WhatsApp abierto: pulsa «enviar» en el chat." : "SMS abierto: pulsa «enviar».");
    setAbierto(false);
  };

  return (
    <>
      <button type="button" onClick={() => { setAviso(null); setAbierto(true); }} data-accion="avisar-cliente"
        className="flex min-h-16 w-full items-center justify-center rounded-xl bg-green-600 text-lg font-bold text-white hover:bg-green-500">
        {etiqueta ?? "💬 Avisar al cliente"}
      </button>
      {aviso && <p role="status" className="text-sm text-green-300">{aviso}</p>}
      {abierto && (
        <div role="dialog" aria-modal="true" aria-label="Avisar al cliente" className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/70 sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) setAbierto(false); }}>
          <div className="w-full max-w-md space-y-3 rounded-t-2xl border border-slate-700 bg-slate-900 p-4 sm:rounded-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-green-400">Avisar al cliente{cliente ? ` · ${cliente}` : ""}</h2>
              <button type="button" onClick={() => setAbierto(false)} className="min-h-11 rounded-lg border border-slate-600 px-3 text-sm">Cerrar</button>
            </div>
            {modo === "conductor" && <p className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm font-semibold text-amber-200">🛑 Envíalo parado: nunca con el coche en marcha.</p>}
            {!tel && <p role="alert" className="text-sm text-red-400">Sin teléfono válido del cliente: llama a la central.</p>}
            {tipos.map((tipo) => (
              <div key={tipo} className="space-y-2 rounded-xl border border-slate-700 p-3">
                {tipo === "retraso" && (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Minutos de retraso">
                    {MINUTOS.map((m) => {
                      const on = (retraso ?? est.minutos ?? 10) === m;
                      return <button key={m} type="button" aria-pressed={on} onClick={() => setRetraso(m)}
                        className={`min-h-11 rounded-lg border px-3 text-sm font-semibold ${on ? "border-amber-400 bg-amber-500/20 text-amber-200" : "border-slate-600"}`}>+{m} min</button>;
                    })}
                    {est.minutos != null && !MINUTOS.includes(est.minutos) && retraso == null && <span className="self-center text-sm text-amber-200">+{est.minutos} min (contador)</span>}
                  </div>
                )}
                <button type="button" disabled={!tel} onClick={() => enviar(tipo, "whatsapp")} data-aviso={tipo}
                  className="min-h-14 w-full rounded-xl bg-green-600 text-base font-bold text-white disabled:opacity-40">{BOTON_AVISO[tipo]} · WhatsApp</button>
                <p className="text-xs text-slate-400">{texto(tipo)}</p>
                <button type="button" disabled={!tel} onClick={() => enviar(tipo, "sms")} className="text-sm text-slate-300 underline disabled:opacity-40">Enviar por SMS</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
