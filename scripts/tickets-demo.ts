// Genera public/demo/ticket-1.jpg y ticket-2.jpg: texto monoespaciado, alto contraste y grande para que el OCR los lea.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const tickets = [
  { fichero: "ticket-1.jpg", fecha: "08/10/2026", litros: "42,15", precio: "1,459", total: "61,50" },
  { fichero: "ticket-2.jpg", fecha: "03/10/2026", litros: "38,60", precio: "1,469", total: "56,70" },
];

function svg(t: (typeof tickets)[number]): string {
  const lineas = [
    "ESTACION DEMO COSTA DORADA", "Salou (Tarragona)", "",
    `Fecha: ${t.fecha}`, "", "DIESEL A", `Litros ${t.litros} L`, `Precio ${t.precio} EUR/L`, "",
    `TOTAL ${t.total} EUR`, "", "TICKET DE DEMOSTRACION",
  ];
  const alto = 60 + lineas.length * 48;
  const filas = lineas.map((l, i) => `<text x="30" y="${60 + i * 48}" font-family="Courier New, Courier, monospace" font-size="30" font-weight="bold" fill="#000">${l}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${alto}"><rect width="100%" height="100%" fill="#fff"/>${filas}</svg>`;
}

async function main() {
mkdirSync("public/demo", { recursive: true });
for (const t of tickets) {
  await sharp(Buffer.from(svg(t))).flatten({ background: "#fff" }).jpeg({ quality: 92 }).toFile(`public/demo/${t.fichero}`);
  console.log("generado", t.fichero);
}
}
main();
