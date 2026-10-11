// Direcciones legibles al volante: las de Nominatim son largas («Carrer…, Part Alta, Tarragona, Tarragonés,
// Tarragona, Cataluña, 43002, España»). Se separan en línea principal (calle/lugar) y localidad.

const SOBRAN = new Set(["españa", "spain", "cataluña", "catalunya", "tarragonés", "tarragonès", "bajo campo", "baix camp",
  "barcelonés", "barcelonès", "alt camp", "baix penedès", "baix ebre", "costa dorada"]);

const PROVINCIAS = new Set(["tarragona", "barcelona", "lleida", "girona", "lérida", "gerona"]);

export interface DireccionCorta { principal: string; localidad: string | null; completa: string }

export function direccionCorta(texto: string): DireccionCorta {
  const completa = texto.trim();
  const partes = completa.split(",").map((p) => p.trim()).filter(Boolean)
    .filter((p) => !/^\d{5}$/.test(p) && !SOBRAN.has(p.toLowerCase()));
  // Quita repeticiones (p. ej. «Tarragona, …, Tarragona» ciudad y provincia).
  const unicas = partes.filter((p, i) => partes.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i);
  // La provincia al final no es la localidad (… Reus, Tarragona): se quita si hay algo más delante.
  if (unicas.length >= 4 && PROVINCIAS.has(unicas[unicas.length - 1].toLowerCase())) unicas.pop();
  if (unicas.length <= 1) return { principal: unicas[0] ?? completa, localidad: null, completa };
  const localidad = unicas.length >= 3 ? unicas[unicas.length - 1] : unicas[1];
  const principal = unicas.length >= 3 ? unicas.slice(0, 2).join(", ") : unicas[0];
  return { principal, localidad: localidad === principal ? null : localidad, completa };
}

/** Enlace de navegación: coordenadas si las hay; si no, búsqueda por texto. */
export function urlNavegacion(texto: string, lat?: number | null, lng?: number | null): string {
  const destino = lat != null && lng != null ? `${lat},${lng}` : encodeURIComponent(texto);
  return `https://www.google.com/maps/dir/?api=1&destination=${destino}`;
}
