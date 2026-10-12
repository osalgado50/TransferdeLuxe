// Módulos opcionales activables desde la central. Se guardan en ajustes.modulos ({clave: boolean}); ausente = activo.
export const MODULOS = [
  { clave: "jornada", nombre: "Jornada laboral", descripcion: "Inicio/fin de jornada y pausas en la app del conductor (registro horario)" },
  { clave: "incidencias", nombre: "Incidencias", descripcion: "Botón de avería, accidente o cliente no presentado con foto" },
  { clave: "checklist", nombre: "Checklist del vehículo", descripcion: "Revisión del vehículo al empezar el turno" },
  { clave: "cierre", nombre: "Hoja de cierre del vehículo", descripcion: "Al finalizar la jornada: daños en el diagrama del coche, niveles, combustible, km y comentario (requiere Jornada y Checklist)" },
  { clave: "mantenimiento", nombre: "Mantenimiento de flota", descripcion: "ITV, seguro y revisiones por km con avisos" },
  { clave: "informes", nombre: "Informes", descripcion: "Servicios, km y combustible por conductor y vehículo" },
  { clave: "vuelos", nombre: "Seguimiento de vuelos", descripcion: "Nº de vuelo, enlace de consulta y hora real de llegada" },
] as const;

export type ClaveModulo = (typeof MODULOS)[number]["clave"];
export type EstadoModulos = Record<ClaveModulo, boolean>;

/** Normaliza lo guardado en BD: cualquier clave ausente o no booleana cuenta como activa. */
export function leerModulos(guardado: unknown): EstadoModulos {
  const g = (guardado && typeof guardado === "object" ? guardado : {}) as Record<string, unknown>;
  return Object.fromEntries(MODULOS.map((m) => [m.clave, g[m.clave] !== false])) as EstadoModulos;
}

/** Desde el formulario de la central: casilla marcada = activo. */
export function modulosDesdeFormulario(fd: Iterable<[string, unknown]>): EstadoModulos {
  const marcadas = new Set([...fd].filter(([k, v]) => k.startsWith("mod_") && v === "on").map(([k]) => k.slice(4)));
  return Object.fromEntries(MODULOS.map((m) => [m.clave, marcadas.has(m.clave)])) as EstadoModulos;
}
