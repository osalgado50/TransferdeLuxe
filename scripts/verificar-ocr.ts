// Comprueba que el OCR (tesseract.js en Node) + extraerDatosTicket leen bien los tickets de demo.
import { createWorker } from "tesseract.js";
import { extraerDatosTicket } from "../src/lib/lector/extraer";

const esperado: Record<string, { fecha: string; litros: number; precio_litro: number; importe: number }> = {
  "ticket-1.jpg": { fecha: "2026-10-08", litros: 42.15, precio_litro: 1.459, importe: 61.5 },
  "ticket-2.jpg": { fecha: "2026-10-03", litros: 38.6, precio_litro: 1.469, importe: 56.7 },
};
async function main() {
  const w = await createWorker("spa");
  let fallos = 0;
  for (const [f, e] of Object.entries(esperado)) {
    const { data } = await w.recognize(`public/demo/${f}`);
    const d = extraerDatosTicket(data.text);
    const ok = d.fecha === e.fecha && d.litros === e.litros && d.precio_litro === e.precio_litro && d.importe === e.importe;
    if (!ok) fallos++;
    console.log(f, ok ? "OK" : "FALLO", JSON.stringify(d));
    if (!ok) console.log(data.text);
  }
  await w.terminate();
  process.exit(fallos ? 1 : 0);
}
main();
