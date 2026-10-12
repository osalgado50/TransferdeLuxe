import { textoAlertaCentral } from "@dominio/centralMovil";
import * as Haptics from "expo-haptics";
import { useEffect, useRef } from "react";
import { Vibration } from "react-native";
import type { Movimiento } from "@dominio/actividad";
import { nombreTipoIncidencia } from "@dominio/incidencias";
import { useCentral, type ServicioCentral } from "~/lib/central";
import { avisoInsistente, avisoLocal } from "~/lib/push";

/** Tipo de aviso de una alerta de la central (coincide con el `tipo` de los push del vigilante para no duplicarlos). */
function tipoAlerta(s: ServicioCentral): { tipo: string; grave: boolean } {
  const inc = s.ultima_incidencia ?? "";
  if (inc.startsWith("rechazado")) return { tipo: "rechazado", grave: true };
  if (inc === "expirado") return { tipo: "expirado", grave: true };
  if (s.subcontratar && s.estado === "pendiente") return { tipo: "subcontratar", grave: true };
  if (inc === "nuevo") return { tipo: "reserva_nueva", grave: false };
  return { tipo: "alerta", grave: true };
}

/**
 * Modo central con la app abierta: cada alerta NUEVA (rechazo, plazo vencido, subcontratar, reserva web) lanza una
 * notificación local con sonido y una vibración distinta (Error para lo grave, Warning para la reserva nueva).
 * Las alertas que ya había al abrir la app no suenan. Las incidencias leves y checklists llegan por push (AvisosPush);
 * lo grave, además, con el aviso insistente de `useMovimientos`.
 */
export function AlertasSonoras() {
  const { datos, vistos } = useCentral();
  const vistas = useRef<Set<string> | null>(null);
  useMovimientos(datos?.actividad, datos?.graves, vistos);
  useEffect(() => {
    if (!datos) return;
    const nombres = new Map(datos.conductores.map((c) => [c.id, c.nombre]));
    const nombre = (id: string | null) => (id && nombres.get(id)) || "conductor";
    const claves = new Map(datos.alertas.map((s) => [`${s.id}|${s.ultima_incidencia ?? ""}|${s.subcontratar}`, s]));
    const antes = vistas.current;
    vistas.current = new Set(claves.keys());
    if (!antes) return;
    const nuevas = [...claves].filter(([k]) => !antes.has(k)).map(([, s]) => s);
    if (!nuevas.length) return;
    const grave = nuevas.some((s) => tipoAlerta(s).grave);
    Vibration.vibrate(grave ? [0, 250, 120, 250, 120, 250] : [0, 400]);
    void Haptics.notificationAsync(grave ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    for (const s of nuevas.slice(0, 3)) {
      const a = textoAlertaCentral(s, nombre);
      void avisoLocal(`alerta-${s.id}`, a.titulo, a.texto, { tipo: tipoAlerta(s).tipo, servicioId: s.id });
    }
  }, [datos]);
  return null;
}

const VIBRA_GRAVE = [0, 400, 150, 400, 150, 400, 150, 400];
const vibrarGrave = () => {
  Vibration.vibrate(VIBRA_GRAVE);
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
};

/**
 * «Actividad en vivo» con la app abierta. Cada GRAVE nueva (avería, accidente): notificación local con sonido y
 * vibración Error, insistente cada 30 s (máx. 5) hasta pulsar «Visto»/«Resuelta». El resto de movimientos nuevos
 * (aceptado, recogido…): solo una vibración suave, sin notificación por cada uno (para no saturar).
 * Lo que ya había al abrir la app no suena.
 */
function useMovimientos(actividad: Movimiento[] | undefined, graves: Movimiento[] | undefined, vistos: ReadonlySet<string>) {
  const conocidos = useRef<Set<string> | null>(null);
  const pendientes = useRef(new Set<string>());
  const insistentes = useRef(new Map<string, () => void>());
  useEffect(() => {
    if (!actividad && !graves) return;
    const sinVer = (graves ?? []).filter((g) => !vistos.has(g.id));
    pendientes.current = new Set(sinVer.map((g) => g.id));
    for (const [id, parar] of insistentes.current) if (!pendientes.current.has(id)) { parar(); insistentes.current.delete(id); }
    const antes = conocidos.current;
    conocidos.current = new Set([...(actividad ?? []).map((m) => m.id), ...(graves ?? []).map((g) => g.id)]);
    if (!antes) return;
    let nuevaGrave = false;
    for (const g of sinVer) {
      if (antes.has(g.id) || insistentes.current.has(g.id)) continue;
      nuevaGrave = true;
      const titulo = g.cierreId ? g.texto.replace(/ · «.*»$/, "") // «🔴 Daños en Capó · 0001-TDL · Marc»
        : [`⚠ ${nombreTipoIncidencia(g.tipo.replace(/^incidencia_/, "")).toUpperCase()}`, g.conductor, g.zona].filter(Boolean).join(" · "); // «⚠ AVERÍA · Laia · cerca de Reus»
      const cuerpo = [g.descripcion, g.detalle, g.hora].filter(Boolean).join(" · ") || "Abre la central y llama al conductor";
      insistentes.current.set(g.id, avisoInsistente({
        id: `grave-${g.id}`, titulo, cuerpo: () => cuerpo, cadaMs: 30_000, veces: 5,
        datos: { tipo: g.cierreId ? "cierre" : "incidencia", grave: true, ...(g.incidenciaId ? { incidenciaId: g.incidenciaId } : {}), ...(g.cierreId ? { cierreId: g.cierreId } : {}), ...(g.servicioId ? { servicioId: g.servicioId } : {}) },
        sigue: () => pendientes.current.has(g.id), alRepetir: vibrarGrave,
      }));
    }
    if (nuevaGrave) { vibrarGrave(); return; }
    if ((actividad ?? []).some((m) => !antes.has(m.id))) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [actividad, graves, vistos]);
  useEffect(() => {
    const mapa = insistentes.current;
    return () => { mapa.forEach((parar) => parar()); mapa.clear(); };
  }, []);
}
