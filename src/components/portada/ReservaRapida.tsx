"use client";
import Link from "next/link";
import { startTransition, useActionState, useMemo, useRef, useState, type FormEvent } from "react";
import CampoDireccion from "@/components/comun/CampoDireccion";
import EnlacePrivacidad from "@/components/legal/EnlacePrivacidad";
import { tipoMinimo } from "@/lib/dominio/capacidad";
import { DESTINOS_FRECUENTES, TEXTOS, type Idioma } from "@/lib/i18n/portada";
import { reservar, type EstadoReserva } from "@/app/reservar/actions";
import { enlaceLlamar, enlaceWhatsApp, horaMinima, sinAntelacion } from "@/lib/reserva/disponibilidad";

type Estado = EstadoReserva & { actualizada?: boolean };
/** Si la web se ha actualizado mientras el cliente rellenaba (la acción del servidor ya no existe), aviso en vez de romperse. */
async function enviarReserva(prev: Estado, fd: FormData): Promise<Estado> {
  try { return await reservar(prev, fd); } catch { return { actualizada: true }; }
}

const campo = "mt-2 min-h-14 w-full rounded-xl border-2 border-white/10 bg-white px-4 text-lg text-slate-900 placeholder:text-slate-400 focus:border-amber-300 focus:outline-none";
const etiqueta = "block text-base font-semibold text-white";
// El de dirección sin margen propio (lo pone CampoDireccion): así el micrófono queda centrado dentro del campo.
const campoDireccion = campo.replace("mt-2 ", "");
const hoyMadrid = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());

/** − 2 + en grande, para el móvil. */
function Contador({ nombre, etiq, valor, min, max, onCambio, menos, mas }: {
  nombre: string; etiq: string; valor: number; min: number; max: number; onCambio: (n: number) => void; menos: string; mas: string;
}) {
  const boton = "flex size-14 items-center justify-center rounded-xl bg-white/10 text-3xl font-bold text-white hover:bg-white/20 disabled:opacity-30";
  return (
    <div>
      <span className={etiqueta} id={`${nombre}-etq`}>{etiq}</span>
      <div className="mt-2 flex items-center gap-2" role="group" aria-labelledby={`${nombre}-etq`}>
        <button type="button" className={boton} aria-label={`${etiq}: ${menos}`} disabled={valor <= min} onClick={() => onCambio(valor - 1)}>−</button>
        <output className="min-w-12 text-center text-3xl font-bold tabular-nums text-white" aria-live="polite">{valor}</output>
        <button type="button" className={boton} aria-label={`${etiq}: ${mas}`} disabled={valor >= max} onClick={() => onCambio(valor + 1)}>+</button>
      </div>
      <input type="hidden" name={nombre} value={valor} />
    </div>
  );
}

/**
 * Reserva rápida de la portada (castellano, catalán o inglés): lo justo para pedir un traslado. El vehículo lo elige solo
 * según pasajeros y maletas; envía a la misma acción y validación que /reservar (que sigue para ida y vuelta o un
 * vehículo concreto).
 */
export default function ReservaRapida({ idioma }: { idioma: Idioma }) {
  const t = TEXTOS[idioma];
  const [estado, enviar, pendiente] = useActionState<Estado, FormData>(enviarReserva, {});
  const [fecha, setFecha] = useState("");
  const [horaLocal, setHoraLocal] = useState<string | null>(null);
  const [verHueco, setVerHueco] = useState(true);
  const ultimo = useRef<FormData | null>(null);
  const campoHora = useRef<HTMLInputElement>(null);
  // Se envía a mano (no con action=): así, si hay un error, el formulario conserva lo escrito.
  const enviarForm = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (sinAntelacion(String(fd.get("fecha")), String(fd.get("hora")), Date.now())) { setHoraLocal(t.form.pronto); campoHora.current?.focus(); return; }
    setHoraLocal(null); setVerHueco(true);
    ultimo.current = fd;
    startTransition(() => enviar(fd));
  };
  const enviarIgualmente = () => {
    if (!ultimo.current) return;
    const fd = new FormData(); ultimo.current.forEach((v, k) => fd.append(k, v)); fd.set("forzar", "1");
    startTransition(() => enviar(fd));
  };
  const [pax, setPax] = useState(2);
  const [maletas, setMaletas] = useState(2);
  const [destino, setDestino] = useState<{ n: number; texto: string; lat: number; lng: number }>();
  const tipo = useMemo(() => tipoMinimo(pax, maletas) ?? "minibus", [pax, maletas]);

  // Los mensajes del servidor van en castellano: aquí se traducen a lo que necesita saber el cliente.
  const error = (k: string): string | null => {
    const m = estado.errores?.[k]?.[0];
    if (!m) return null;
    if (/antelaci/.test(m)) return t.form.pronto;
    if (/pasado/.test(m)) return t.form.pasado;
    if (/vuelta/.test(m)) return t.form.vuelta;
    if (k === "cliente_email") return t.form.correo;
    return t.form.campo;
  };
  const errorGeneral = estado.ok || estado.sinHueco || estado.actualizada ? null
    : estado.errores ? t.form.revisa : estado.mensaje ? (/Demasiadas/.test(estado.mensaje) ? t.form.demasiados : t.form.revisa) : null;

  if (estado.ok) {
    return (
      <div role="status" className="rounded-3xl border border-amber-300/40 bg-slate-950/80 p-8 text-center shadow-2xl backdrop-blur">
        <p className="text-6xl" aria-hidden>✓</p>
        <p className="mt-3 font-titulo text-4xl font-bold text-amber-200">{t.form.ok}</p>
        <p className="mt-3 text-xl text-slate-200">{t.form.okDetalle}</p>
        <a href={`/?lang=${idioma}#reserva`} className="mt-6 inline-flex min-h-14 items-center rounded-xl bg-amber-300 px-6 text-lg font-bold text-slate-950 hover:bg-amber-200">{t.form.otra}</a>
      </div>
    );
  }

  const Err = ({ k }: { k: string }) => { const e = (k === "hora" && horaLocal) || error(k); return e ? <p className="mt-1 text-base font-medium text-red-300">{e}</p> : null; };
  // Datos de la última solicitud, para el WhatsApp a la central si no hay coche libre.
  const u = ultimo.current;
  const textoWa = u ? t.form.mensajeWhatsApp({ dia: String(u.get("fecha")).split("-").reverse().join("/"), hora: String(u.get("hora")),
    origen: String(u.get("origen_texto")), destino: String(u.get("destino_texto")), pax: Number(u.get("pasajeros")) || 1 }) : "";
  const wa = estado.sinHueco ? enlaceWhatsApp(estado.contacto?.whatsapp ?? estado.contacto?.telefono, textoWa) : null;
  const tel = estado.sinHueco ? enlaceLlamar(estado.contacto?.telefono ?? estado.contacto?.whatsapp) : null;

  return (
    <form onSubmit={enviarForm} className="space-y-5 rounded-3xl border border-white/10 bg-slate-950/75 p-5 shadow-2xl backdrop-blur-md sm:p-7" aria-labelledby="titulo-reserva">
      <h2 id="titulo-reserva" className="font-titulo text-3xl font-bold text-white sm:text-4xl">{t.form.titulo}</h2>

      <CampoDireccion name="origen" conUbicacion etiqueta={t.form.recogida} requerido placeholder={t.form.recogidaAyuda} error={error("origen_texto") ?? undefined}
        textos={t.direccion} claseInput={campoDireccion} claseEtiqueta={etiqueta} />
      <div>
        <CampoDireccion name="destino" etiqueta={t.form.destino} requerido placeholder={t.form.destinoAyuda} error={error("destino_texto") ?? undefined}
          textos={t.direccion} claseInput={campoDireccion} claseEtiqueta={etiqueta} rellenar={destino} />
        <p className="mt-3 text-base font-medium text-slate-300">{t.form.frecuentes}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {DESTINOS_FRECUENTES.map((d) => (
            <button key={d.texto} type="button" onClick={() => setDestino({ n: Date.now(), texto: d.texto, lat: d.lat, lng: d.lng })}
              className="min-h-11 rounded-full border border-white/20 bg-white/5 px-4 text-base text-white hover:border-amber-300 hover:bg-white/10">
              {d.nombre[idioma]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <label className={`${etiqueta} min-w-0`}>{t.form.dia}
          <input type="date" name="fecha" required min={hoyMadrid()} value={fecha} onChange={(e) => { setFecha(e.target.value); setHoraLocal(null); }} className={campo} /><Err k="fecha" /></label>
        <label className={`${etiqueta} min-w-0`}>{t.form.hora}
          <input ref={campoHora} type="time" name="hora" required min={horaMinima(fecha, Date.now())} onChange={() => setHoraLocal(null)} className={campo} /><Err k="hora" /></label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Contador nombre="pasajeros" etiq={t.form.pasajeros} valor={pax} min={1} max={19} onCambio={setPax} menos={t.form.menos} mas={t.form.mas} />
        <Contador nombre="maletas" etiq={t.form.maletas} valor={maletas} min={0} max={19} onCambio={setMaletas} menos={t.form.menos} mas={t.form.mas} />
      </div>
      <p className="rounded-xl bg-white/5 px-4 py-3 text-lg text-slate-200">🚘 {t.form.vehiculo}: <b className="text-amber-200">{t.vehiculos[tipo]}</b></p>
      <input type="hidden" name="tipo_vehiculo_pedido" value={tipo} />

      <label className={etiqueta}>{t.form.vuelo} <span className="font-normal text-slate-400">· {t.form.vueloAyuda}</span>
        <input type="text" name="numero_vuelo" maxLength={10} autoCapitalize="characters" className={campo} /><Err k="numero_vuelo" /></label>

      <label className={etiqueta}>{t.form.nombre}
        <input type="text" name="cliente_nombre" required autoComplete="name" className={campo} /><Err k="cliente_nombre" /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={etiqueta}>{t.form.telefono}
          <input type="tel" name="cliente_telefono" required autoComplete="tel" inputMode="tel" className={campo} /><Err k="cliente_telefono" /></label>
        <label className={etiqueta}>{t.form.email}
          <input type="email" name="cliente_email" required autoComplete="email" className={campo} /><Err k="cliente_email" /></label>
      </div>
      <label className={etiqueta}>{t.form.notas} <span className="font-normal text-slate-400">· {t.form.notasAyuda}</span>
        <textarea name="notas" rows={2} maxLength={500} className={`${campo} py-3`} /></label>

      {/* Campo trampa para robots: invisible y vacío */}
      <input type="text" name="web" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <label className="flex items-start gap-3 text-lg text-slate-200">
        <input type="checkbox" name="acepta_privacidad" required className="mt-1 size-6 accent-amber-300" />
        <span>{t.form.privacidad} <EnlacePrivacidad idioma={idioma} className="font-semibold text-amber-200 underline">{t.form.politica}</EnlacePrivacidad></span>
      </label>
      <Err k="acepta_privacidad" />

      {errorGeneral && <p role="alert" className="rounded-xl bg-red-500/15 px-4 py-3 text-lg font-medium text-red-200">{errorGeneral}</p>}
      {estado.actualizada && (
        <div role="alert" className="space-y-3 rounded-xl bg-amber-400/15 px-4 py-3 text-lg text-amber-100">
          <p>{t.form.actualizada}</p>
          <button type="button" onClick={() => location.reload()} className="min-h-12 w-full rounded-xl bg-amber-300 font-bold text-slate-950">{t.form.recargar}</button>
        </div>
      )}
      {estado.sinHueco && verHueco && !pendiente && (
        <div role="alert" className="space-y-3 rounded-2xl border border-amber-300/40 bg-amber-400/10 p-4">
          <p className="text-xl font-bold text-amber-200">{t.form.sinHueco}</p>
          <p className="text-lg text-slate-200">{t.form.sinHuecoTexto}</p>
          <div className="grid gap-2">
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-emerald-500 text-lg font-bold text-white">💬 {t.form.whatsapp}</a>}
            {tel && <a href={tel} className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-white text-lg font-bold text-slate-900">📞 {t.form.llamar}</a>}
            <button type="button" onClick={() => { setVerHueco(false); campoHora.current?.focus(); }} className="min-h-12 rounded-xl border border-white/20 text-lg text-white">{t.form.otraHora}</button>
            <button type="button" onClick={enviarIgualmente} className="min-h-12 rounded-xl text-base text-slate-300 underline">{t.form.igualmente}</button>
          </div>
        </div>
      )}
      <button type="submit" disabled={pendiente}
        className="min-h-16 w-full rounded-2xl bg-gradient-to-r from-amber-300 to-orange-400 text-2xl font-bold text-slate-950 shadow-lg shadow-orange-500/20 transition hover:brightness-105 disabled:opacity-60">
        {pendiente ? t.form.enviando : t.form.enviar}
      </button>
      <p className="text-center text-base">
        <Link href="/reservar" className="text-slate-300 underline decoration-white/30 hover:text-white">{t.form.completa}</Link>
      </p>
    </form>
  );
}
