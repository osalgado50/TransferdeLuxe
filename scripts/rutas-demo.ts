/**
 * Calcula UNA vez las rutas por carretera entre los lugares de la demo (OSRM público de OpenStreetMap, gratuito) y las
 * guarda simplificadas en src/lib/demo/rutasCarretera.ts. La app no llama a ningún servicio externo en marcha.
 *   npx tsx scripts/rutas-demo.ts
 */
import fs from "node:fs";
import { LUGARES_DEMO } from "../src/lib/demo/datosDemo";

type P = [number, number]; // [lat, lng]
const lugares = Object.entries(LUGARES_DEMO) as [string, { lat: number; lng: number }][];

// Douglas-Peucker en metros (aprox. plana, suficiente a esta escala).
function simplificar(pts: P[], tolM: number): P[] {
  if (pts.length < 3) return pts;
  const kx = 111320 * Math.cos((pts[0][0] * Math.PI) / 180), ky = 110540;
  const d = (p: P, a: P, b: P) => {
    const [x, y, x1, y1, x2, y2] = [p[1] * kx, p[0] * ky, a[1] * kx, a[0] * ky, b[1] * kx, b[0] * ky];
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l2)) : 0;
    return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
  };
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) { const v = d(pts[i], pts[0], pts.at(-1)!); if (v > max) { max = v; idx = i; } }
  if (max <= tolM) return [pts[0], pts.at(-1)!];
  return [...simplificar(pts.slice(0, idx + 1), tolM).slice(0, -1), ...simplificar(pts.slice(idx), tolM)];
}

async function main() {
const rutas: Record<string, P[]> = {};
for (let i = 0; i < lugares.length; i++) {
  for (let j = i + 1; j < lugares.length; j++) {
    const [ka, a] = lugares[i], [kb, b] = lugares[j];
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
    const r = await fetch(url, { headers: { "User-Agent": "TransferdeLuxe-demo (hackathon)" } });
    const j2 = (await r.json()) as { routes?: { geometry: { coordinates: [number, number][] }; distance: number }[] };
    const g = j2.routes?.[0];
    if (!g) { console.warn("sin ruta", ka, kb); continue; }
    const pts: P[] = [[a.lat, a.lng], ...g.geometry.coordinates.map(([lng, lat]) => [lat, lng] as P), [b.lat, b.lng]];
    rutas[`${ka}|${kb}`] = simplificar(pts, 25).map(([la, ln]) => [Math.round(la * 1e5) / 1e5, Math.round(ln * 1e5) / 1e5]);
    console.log(`${ka} → ${kb}: ${(g.distance / 1000).toFixed(1)} km, ${rutas[`${ka}|${kb}`].length} puntos`);
    await new Promise((res) => setTimeout(res, 1100)); // servidor público: una petición por segundo
  }
}
const cuerpo = Object.entries(rutas).map(([k, v]) => `  "${k}": ${JSON.stringify(v)},`).join("\n");
fs.writeFileSync("src/lib/demo/rutasCarretera.ts", `/**
 * Rutas por carretera entre los lugares de la demo ([lat, lng], simplificadas a ~25 m). Generado por
 * scripts/rutas-demo.ts con OSRM (datos © colaboradores de OpenStreetMap, ODbL). No editar a mano.
 */
export const RUTAS_CARRETERA: Record<string, [number, number][]> = {
${cuerpo}
};
`);
console.log("rutas:", Object.keys(rutas).length);
}

void main();
