import type { InfoLlegada, ProveedorVuelos } from "./proveedor";

const HOST = "aerodatabox.p.rapidapi.com";

function fecha(v: unknown): Date | null {
  const utc = v && typeof v === "object" ? (v as { utc?: unknown }).utc : null;
  if (typeof utc !== "string") return null;
  // AeroDataBox devuelve «2026-10-12 10:25Z».
  const d = new Date(utc.replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

/** Parseo defensivo de la respuesta de /flights/number/{codigo}/{fecha}. */
export function parsearAeroDataBox(json: unknown): InfoLlegada | null {
  const vuelos = Array.isArray(json) ? json : [];
  for (const v of vuelos) {
    const llegada = v && typeof v === "object" ? (v as { arrival?: unknown }).arrival : null;
    if (!llegada || typeof llegada !== "object") continue;
    const a = llegada as Record<string, unknown>;
    const programada = fecha(a.scheduledTime);
    const real = fecha(a.runwayTime) ?? fecha(a.actualTime) ?? fecha(a.revisedTime) ?? fecha(a.predictedTime);
    if (!programada && !real) continue;
    const estado = typeof (v as { status?: unknown }).status === "string" ? (v as { status: string }).status : null;
    return { programada, real, estado };
  }
  return null;
}

export function crearAeroDataBox(apiKey: string, f: typeof fetch = fetch, timeoutMs = 6000): ProveedorVuelos {
  return {
    nombre: "AeroDataBox",
    async consultarLlegada(codigo, dia) {
      if (!/^[A-Z0-9]{3,7}$/.test(codigo) || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
      try {
        const res = await f(`https://${HOST}/flights/number/${codigo}/${dia}?withAircraftImage=false&withLocation=false`, {
          headers: { "X-RapidAPI-Key": apiKey, "X-RapidAPI-Host": HOST, Accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs), cache: "no-store",
        });
        if (!res.ok) return null;
        return parsearAeroDataBox(await res.json().catch(() => null));
      } catch {
        return null;
      }
    },
  };
}
