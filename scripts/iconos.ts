import sharp from "sharp";
import { writeFileSync } from "node:fs";

const svg = (n: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="0 0 512 512">
<rect width="512" height="512" fill="#0f172a"/>
<text x="256" y="320" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="200" text-anchor="middle" fill="#fbbf24">TdL</text></svg>`;

async function main() {
for (const n of [192, 512]) {
  writeFileSync(`public/icon-${n}.png`, await sharp(Buffer.from(svg(n))).png().toBuffer());
  console.log(`public/icon-${n}.png`);
}
}
void main();
