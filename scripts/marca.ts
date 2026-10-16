// Activos de la marca ficticia del proyecto (TransferdeLuxe) a partir del emblema dibujado en src/lib/marca/emblema.ts.
// Uso: npx tsx scripts/marca.ts          → iconos de la web y logo de dentro de la app (se publica por OTA)
//      npx tsx scripts/marca.ts --app    → además icono, icono adaptable de Android y pantalla de inicio de la app
//                                          (cambian la huella nativa: exigen compilar de nuevo)
import sharp from "sharp";
import { emblemaSvg, logoSvg } from "../src/lib/marca/emblema";

const FONDO = "#0b1b2e";
/** Icono cuadrado: emblema sobre el fondo de la marca, con margen (`escala` = parte del lado que ocupa). */
const icono = (lado: number, escala = 0.78, fondo: string | null = FONDO) => {
  const e = Math.round(lado * escala), m = Math.round((lado - e) / 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${lado}" height="${lado}" viewBox="0 0 ${lado} ${lado}">
${fondo ? `<rect width="${lado}" height="${lado}" fill="${fondo}"/>` : ""}<svg x="${m}" y="${m}" width="${e}" height="${e}" viewBox="0 0 100 100">${emblemaSvg()}</svg></svg>`;
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 });
};

async function main() {
  // Web: favicon, iconos de la app web (PWA) y del iPhone.
  await icono(64).toFile("src/app/icon.png");
  await icono(192).toFile("public/icon-192.png");
  await icono(512).toFile("public/icon-512.png");
  await icono(180).toFile("public/apple-touch-icon.png");
  // App: logo de la pantalla de acceso y de la intro (asset de JS: va por OTA).
  await sharp(Buffer.from(logoSvg())).resize(600, 600).png({ compressionLevel: 9 }).toFile("movil/assets/images/logo.png");
  if (process.argv.includes("--app")) {
    await icono(1024, 0.74).toFile("movil/assets/images/icon.png");
    await icono(1024, 0.56, null).toFile("movil/assets/images/android-icon-foreground.png"); // zona segura del icono adaptable
    await icono(48, 0.86).toFile("movil/assets/images/favicon.png");
    await sharp(Buffer.from(logoSvg())).resize(800, 800).png({ compressionLevel: 9 }).toFile("movil/assets/images/splash-icon-v2.png");
  }
  console.log("Activos de marca generados" + (process.argv.includes("--app") ? " (con los de la app nativa)" : ""));
}
void main();
