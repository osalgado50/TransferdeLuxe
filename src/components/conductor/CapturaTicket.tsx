"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { guardarTicket, type EstadoTicket } from "@/app/conductor/ticket/actions";
import { redimensionar } from "@/lib/imagen";
import { TesseractLector } from "@/lib/lector/tesseract";
import { esCoherente } from "@/lib/lector/parsear";
import type { DatosTicket } from "@/lib/lector/tipos";
import { recalcular, type CampoImporte, type Derivado } from "@/lib/dominio/ticketCalculo";

type Fase = "inicio" | "leyendo" | "formulario";
const campo = "w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-zinc-100";
const hoy = () => new Date().toISOString().slice(0, 10);

function aBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(new Error("No se pudo leer la imagen"));
    r.readAsDataURL(b);
  });
}
const conTimeout = <T,>(p: Promise<T>, ms: number) =>
  new Promise<T>((res, rej) => { const t = setTimeout(() => rej(new Error("timeout")), ms); p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); });

export default function CapturaTicket({ demo }: { demo: boolean }) {
  const [estado, accion, pendiente] = useActionState<EstadoTicket, FormData>(guardarTicket, {});
  const [fase, setFase] = useState<Fase>("inicio");
  const [progreso, setProgreso] = useState(0);
  const [datos, setDatos] = useState<DatosTicket | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const [miniatura, setMiniatura] = useState<string | null>(null);
  const [fotoPath, setFotoPath] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [valores, setValores] = useState({ litros: "", precio_litro: "", importe: "" });
  // Con el importe, el €/L o los litros (el que no se ha escrito el último) se calcula solo.
  const [derivado, setDerivado] = useState<Derivado>(null);
  const cambiar = (k: CampoImporte, t: string) => {
    const r = recalcular({ litros: valores.litros, precio: valores.precio_litro, importe: valores.importe, [k]: t }, k, derivado);
    setDerivado(r.derivado);
    setValores({ litros: r.valores.litros, precio_litro: r.valores.precio, importe: r.valores.importe });
  };
  const urlRef = useRef<string | null>(null);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  async function procesar(file: File) {
    setErrorFoto(null); setAviso(null); setDatos(null); setFotoPath(null); setProgreso(0);
    setFase("leyendo");
    let blob: Blob;
    try { blob = await redimensionar(file); } catch { setErrorFoto("No se pudo procesar la imagen"); setFase("inicio"); return; }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(blob); setMiniatura(urlRef.current);

    setSubiendo(true);
    const subida = (async () => {
      const fd = new FormData(); fd.append("foto", new File([blob], "ticket.jpg", { type: "image/jpeg" }));
      const r = await fetch("/api/tickets/foto", { method: "POST", body: fd });
      const j = (await r.json()) as { fotoPath?: string; error?: string };
      if (!r.ok || !j.fotoPath) throw new Error(j.error ?? "No se pudo subir la foto");
      return j.fotoPath;
    })();
    subida.then((p) => setFotoPath(p)).catch((e: Error) => setErrorFoto(e.message)).finally(() => setSubiendo(false));

    let leido: DatosTicket | null = null;
    try {
      const lector = new TesseractLector((p) => setProgreso(p));
      leido = await conTimeout(lector.leer({ base64: await aBase64(blob), mediaType: "image/jpeg" }), 60_000);
    } catch { setAviso("No se pudo leer el ticket; rellénalo a mano"); }
    // Correcciones del lector (coma del €/L, litros recalculados…): que el conductor sepa qué revisar.
    const avisos = (leido as (DatosTicket & { avisos?: string[] }) | null)?.avisos;
    if (avisos?.length) setAviso(avisos.join(" "));
    setDatos(leido);
    setDerivado(null);
    setValores({ litros: leido?.litros != null ? String(leido.litros) : "", precio_litro: leido?.precio_litro != null ? String(leido.precio_litro) : "", importe: leido?.importe != null ? String(leido.importe) : "" });
    setFase("formulario");
  }

  async function ejemplo() {
    const r = await fetch("/demo/ticket-1.jpg"); const b = await r.blob();
    await procesar(new File([b], "ticket-1.jpg", { type: "image/jpeg" }));
  }

  if (estado.ok) return (
    <div className="rounded-xl bg-emerald-900/40 border border-emerald-700 p-4 space-y-3">
      <p className="text-emerald-300 font-medium">Ticket guardado</p>
      <a href="/conductor" className="inline-block rounded-lg bg-marca text-white px-4 py-2 font-medium">Volver a Hoy</a>
    </div>
  );

  if (fase === "inicio") return (
    <div className="space-y-3">
      <label className="block rounded-2xl bg-marca text-white text-center text-lg font-semibold py-6 cursor-pointer">
        📷 Hacer foto del ticket
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void procesar(f); e.target.value = ""; }} />
      </label>
      {errorFoto && <p className="text-red-400 text-sm">{errorFoto}</p>}
      {demo && <button type="button" onClick={() => void ejemplo()} className="w-full rounded-lg border border-zinc-600 py-2 text-zinc-200">Probar con un ticket de ejemplo</button>}
      <button type="button" onClick={() => { setDatos(null); setFase("formulario"); }} className="w-full rounded-lg border border-zinc-700 py-2 text-zinc-300">Rellenar sin foto</button>
    </div>
  );

  if (fase === "leyendo") return (
    <div className="rounded-xl bg-zinc-900 p-6 text-center text-zinc-200" role="status">
      <p className="text-lg">Leyendo ticket…{progreso > 0 ? ` ${progreso} %` : ""}</p>
      <p className="text-sm text-zinc-400 mt-1">Puede tardar unos segundos</p>
    </div>
  );

  const coherente = datos ? esCoherente(datos) : true;
  const n = (s: string) => Number(s.replace(",", "."));
  const incoherente = valores.litros && valores.precio_litro && valores.importe && Math.abs(n(valores.litros) * n(valores.precio_litro) - n(valores.importe)) > 0.1;
  return (
    <form action={accion} className="space-y-3">
      {miniatura && <img src={miniatura} alt="Foto del ticket" className="h-32 rounded-lg object-contain bg-zinc-900" />}
      {datos && <p className="text-sm text-zinc-400">🔎 leído automáticamente · revisa los datos</p>}
      {aviso && <p className="rounded-lg bg-zinc-800 text-zinc-300 p-3 text-sm">{aviso}</p>}
      {(!coherente || incoherente) && <p className="rounded-lg bg-yellow-900/50 border border-yellow-700 text-yellow-200 p-3 text-sm">Los litros × precio no cuadran con el importe: revísalo</p>}
      <input type="hidden" name="foto_path" value={fotoPath ?? ""} />
      <input type="hidden" name="datos_ia" value={datos ? JSON.stringify(datos) : ""} />
      <label className="block text-sm text-zinc-300">Fecha<input name="fecha" type="date" required defaultValue={datos?.fecha ?? hoy()} className={campo} /></label>
      <label className="block text-sm text-zinc-300">Gasolinera<input name="gasolinera" defaultValue={datos?.gasolinera ?? ""} className={campo} /></label>
      <div className="grid grid-cols-3 gap-2">
        <label className="block text-sm text-zinc-300">Litros{derivado === "litros" ? " (calc.)" : ""}<input name="litros" inputMode="decimal" required value={valores.litros} onChange={(e) => cambiar("litros", e.target.value)} className={campo} /></label>
        <label className="block text-sm text-zinc-300">€/L{derivado === "precio" ? " (calc.)" : ""}<input name="precio_litro" inputMode="decimal" value={valores.precio_litro} onChange={(e) => cambiar("precio", e.target.value)} className={campo} /></label>
        <label className="block text-sm text-zinc-300">Importe €<input name="importe" inputMode="decimal" required value={valores.importe} onChange={(e) => cambiar("importe", e.target.value)} className={campo} /></label>
      </div>
      <label className="block text-sm text-zinc-300">Combustible<input name="tipo_combustible" defaultValue={datos?.tipo_combustible ?? ""} className={campo} /></label>
      <label className="block text-sm text-zinc-300">Kilómetros del cuentakilómetros<input name="km" type="number" inputMode="numeric" min={0} required className={campo} /></label>
      {errorFoto && <p className="text-red-400 text-sm">{errorFoto}</p>}
      {estado.error && <p className="text-red-400 text-sm">{estado.error}</p>}
      <button disabled={pendiente || subiendo} className="w-full rounded-xl bg-marca text-white py-3 font-semibold disabled:opacity-50">
        {subiendo ? "Subiendo foto…" : pendiente ? "Guardando…" : "Guardar ticket"}
      </button>
      <button type="button" onClick={() => setFase("inicio")} className="w-full text-sm text-zinc-400 py-2">Empezar de nuevo</button>
    </form>
  );
}
