"use client";
import { useCallback, useEffect, useRef } from "react";
import { crearAntiRafaga, eventosNuevos, sonidoDeEvento, type Sonido } from "@/lib/dominio/sonidos";
import { avisarCentral } from "@/lib/sonidos";

interface Ev { id: number; servicio_id: string; tipo: string; creado_en: string }
interface Serv { id: string; origen_pedido: "web" | "manual" }

/**
 * Sonidos del panel de la central: cada evento nuevo de `eventos_servicio` (llegado por Realtime) suena una vez,
 * con anti-ráfaga (máx. uno cada 1,5 s, el más grave). Los eventos ya presentes al cargar no suenan.
 * Devuelve `pedir` para otras fuentes (incidencias, checklist).
 */
export function useSonidosCentral(eventos: Ev[], servicios: Serv[]): (s: Sonido) => void {
  const freno = useRef<ReturnType<typeof crearAntiRafaga> | null>(null);
  const vistos = useRef<Set<number> | null>(null);
  const esperas = useRef(new Set<ReturnType<typeof setTimeout>>());
  const servs = useRef(servicios);
  useEffect(() => { servs.current = servicios; });
  useEffect(() => {
    const f = crearAntiRafaga(avisarCentral);
    const pend = esperas.current;
    freno.current = f;
    return () => { f.cancelar(); pend.forEach(clearTimeout); pend.clear(); freno.current = null; };
  }, []);

  useEffect(() => {
    if (!vistos.current) { vistos.current = new Set(eventos.map((e) => e.id)); return; }
    const origen = (id: string) => servs.current.find((s) => s.id === id)?.origen_pedido;
    for (const e of eventosNuevos(eventos, vistos.current, Date.now())) {
      // «creado»: el servicio puede llegar por su propio canal un instante después; se espera para saber si es web.
      if (e.tipo === "creado" && !origen(e.servicio_id)) {
        const t = setTimeout(() => {
          esperas.current.delete(t);
          const s = sonidoDeEvento(e.tipo, origen(e.servicio_id));
          if (s) freno.current?.pedir(s);
        }, 1500);
        esperas.current.add(t);
        continue;
      }
      const s = sonidoDeEvento(e.tipo, origen(e.servicio_id));
      if (s) freno.current?.pedir(s);
    }
  }, [eventos]);

  return useCallback((s: Sonido) => freno.current?.pedir(s), []);
}
