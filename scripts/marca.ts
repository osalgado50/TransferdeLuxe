// Prepara los activos de marca (TVL VIP Transfers) a partir de los originales de public/marca/.
// Uso: npx tsx scripts/marca.ts
import sharp from "sharp";

const LOGO = "public/marca/tvl-logo-blanco-original.png";
const ICONO = "public/marca/vip-luxe-icono-192.jpg";

async function main() {
  const logo = sharp(LOGO).trim().resize({ width: 480, withoutEnlargement: true });
  await logo.clone().png({ compressionLevel: 9 }).toFile("public/marca/tvl-logo.png");
  await logo.clone().webp({ quality: 90 }).toFile("public/marca/tvl-logo.webp");
  const icono = (n: number) => sharp(ICONO).resize(n, n, { kernel: "lanczos3" }).png();
  await icono(192).toFile("public/icon-192.png");
  await icono(512).toFile("public/icon-512.png");
  await icono(180).toFile("public/apple-touch-icon.png");
  await icono(64).toFile("src/app/icon.png");
  console.log("Activos de marca generados");
}
void main();
