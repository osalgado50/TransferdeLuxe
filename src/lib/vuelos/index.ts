import "server-only";
import { crearAeroDataBox } from "./aerodatabox";
import type { ProveedorVuelos } from "./proveedor";

export type { ProveedorVuelos, InfoLlegada } from "./proveedor";

/** Proveedor configurado, o null si no hay clave (la consulta automática queda oculta). */
export function proveedorVuelos(): ProveedorVuelos | null {
  const clave = process.env.AERODATABOX_API_KEY?.trim();
  return clave ? crearAeroDataBox(clave) : null;
}
