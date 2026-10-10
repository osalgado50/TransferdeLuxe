import type { TipoVehiculo } from "./tipos";

export const CAPACIDAD_TIPO: Record<TipoVehiculo, { plazas: number; maletas: number }> = {
  sedan: { plazas: 3, maletas: 3 },
  minivan: { plazas: 7, maletas: 7 },
  minivan_premium: { plazas: 8, maletas: 8 },
  microbus: { plazas: 13, maletas: 13 },
  minibus: { plazas: 19, maletas: 19 },
};
const ORDEN: TipoVehiculo[] = ["sedan", "minivan", "minivan_premium", "microbus", "minibus"];

export const NOMBRE_TIPO: Record<TipoVehiculo, string> = {
  sedan: "Sedán", minivan: "MiniVan", minivan_premium: "MiniVan Premium", microbus: "MicroBus", minibus: "MiniBus",
};

export function cabeEnTipo(tipo: TipoVehiculo, pax: number, maletas: number): boolean {
  const c = CAPACIDAD_TIPO[tipo];
  return c.plazas >= pax && c.maletas >= maletas;
}

export function tipoMinimo(pax: number, maletas: number): TipoVehiculo | null {
  return ORDEN.find((t) => cabeEnTipo(t, pax, maletas)) ?? null;
}

export interface VehiculoCapacidad { plazas: number; maletas: number; estado: "activo" | "taller" }

export function vehiculosAptos<T extends VehiculoCapacidad>(vehiculos: T[], pax: number, maletas: number): T[] {
  return vehiculos.filter((v) => v.estado === "activo" && v.plazas >= pax && v.maletas >= maletas);
}

/** Mensaje de aviso si el tipo elegido no cabe; null si cabe. */
export function avisoCapacidad(tipo: TipoVehiculo, pax: number, maletas: number): { mensaje: string; sugerido: TipoVehiculo | null } | null {
  if (cabeEnTipo(tipo, pax, maletas)) return null;
  const c = CAPACIDAD_TIPO[tipo];
  const min = tipoMinimo(pax, maletas);
  const base = `Un ${NOMBRE_TIPO[tipo]} lleva ${c.plazas} pasajeros y ${c.maletas} maletas`;
  return {
    sugerido: min,
    mensaje: min
      ? `${base}; para ${pax} pasajeros y ${maletas} maletas elige ${NOMBRE_TIPO[min]} (${CAPACIDAD_TIPO[min].plazas} pax)`
      : `${base}; para ${pax} pasajeros y ${maletas} maletas no hay un tipo que quepa, consúltanos`,
  };
}

const PREFIJO_SUBCONTRATAR = "subcontratar: ";
const SUFIJO_SUBCONTRATAR = "ningún vehículo propio cabe";

/** Texto guardado en ultima_incidencia cuando ningún vehículo propio cabe. */
export function motivoSubcontratar(pax: number, maletas: number): string {
  return `${PREFIJO_SUBCONTRATAR}${pax} pax y ${maletas} maletas, ${SUFIJO_SUBCONTRATAR}`;
}
/** Extrae la razón legible de un motivo de subcontratación; null si el texto no lo es. */
export function leerMotivoSubcontratar(texto: string | null): string | null {
  if (!texto?.startsWith(PREFIJO_SUBCONTRATAR) || !texto.endsWith(SUFIJO_SUBCONTRATAR)) return null;
  return SUFIJO_SUBCONTRATAR;
}
