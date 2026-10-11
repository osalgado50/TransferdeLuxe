// Checklist diario del vehículo. Lógica pura.
export interface ItemChecklist { id: string; texto: string; orden: number; activo: boolean }
export type RespuestaItem = "ok" | "mal";
export type Respuestas = Record<string, RespuestaItem>;

/** Ítems activos en su orden. */
export function itemsActivos(items: ItemChecklist[]): ItemChecklist[] {
  return items.filter((i) => i.activo).sort((a, b) => a.orden - b.orden || a.texto.localeCompare(b.texto));
}

/** Valida respuestas: todos los ítems activos contestados con ok|mal; ignora claves desconocidas. */
export function validarRespuestas(x: unknown, items: ItemChecklist[]): { ok: true; respuestas: Respuestas; conFallos: boolean } | { ok: false; error: string } {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const respuestas: Respuestas = {};
  for (const i of itemsActivos(items)) {
    const v = o[i.id];
    if (v !== "ok" && v !== "mal") return { ok: false, error: `Falta revisar «${i.texto}».` };
    respuestas[i.id] = v;
  }
  if (!Object.keys(respuestas).length) return { ok: false, error: "No hay ítems en el checklist." };
  return { ok: true, respuestas, conFallos: Object.values(respuestas).includes("mal") };
}

/** Textos de los ítems marcados «mal». */
export function fallos(respuestas: Respuestas, items: ItemChecklist[]): string[] {
  return items.filter((i) => respuestas[i.id] === "mal").sort((a, b) => a.orden - b.orden).map((i) => i.texto);
}

/**
 * Cuándo pedir el checklist: no hecho hoy para el vehículo y, si el módulo de jornada está activo, con la jornada iniciada.
 * Sin módulo de jornada se pide antes de empezar a trabajar (pantalla principal).
 */
export function debePedirChecklist(p: { hecho: boolean; jornadaActiva: boolean; jornadaAbierta: boolean; hayVehiculo: boolean; hayItems: boolean }): boolean {
  return p.hayItems && p.hayVehiculo && !p.hecho && (!p.jornadaActiva || p.jornadaAbierta);
}

/** Nuevo orden tras mover un ítem una posición (dir −1 sube, +1 baja). Devuelve [{id, orden}] reindexado 1..n. */
export function reordenar(items: ItemChecklist[], id: string, dir: -1 | 1): { id: string; orden: number }[] {
  const l = [...items].sort((a, b) => a.orden - b.orden || a.texto.localeCompare(b.texto));
  const i = l.findIndex((x) => x.id === id), j = i + dir;
  if (i >= 0 && j >= 0 && j < l.length) [l[i], l[j]] = [l[j], l[i]];
  return l.map((x, k) => ({ id: x.id, orden: k + 1 }));
}
