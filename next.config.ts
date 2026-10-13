import type { NextConfig } from "next";

// CSP en modo solo-informe (Report-Only): el navegador avisa en consola de lo que bloquearía, sin romper nada.
// Supabase (REST/Realtime), teselas OSM y Tesseract (worker/core/idioma desde jsDelivr/unpkg/projectnaptha, wasm).
const SUPABASE = "https://dmozpxjllhlnwafhwnup.supabase.co";
const CDN_OCR = "https://cdn.jsdelivr.net https://unpkg.com";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: ${CDN_OCR}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://*.tile.openstreetmap.org ${SUPABASE}`,
  "font-src 'self' data:",
  `connect-src 'self' ${SUPABASE} wss://dmozpxjllhlnwafhwnup.supabase.co ${CDN_OCR} https://tessdata.projectnaptha.com data: blob:`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

// Cabeceras de seguridad básicas (sin Permissions-Policy para no romper GPS, mapa ni Supabase).
const cabeceras = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // tesseract.js en el servidor (lectura de tickets de la app nativa) arranca su worker desde node_modules: sin empaquetar.
  serverExternalPackages: ["tesseract.js"],
  // El despliegue solo sube los ficheros que el código requiere de forma estática: el motor wasm de tesseract (y los
  // módulos que se cargan en tiempo de ejecución) hay que declararlos para la ruta que lee los tickets.
  outputFileTracingIncludes: {
    "/api/conductor/ticket/leer": ["./node_modules/tesseract.js-core/**/*", "./node_modules/tesseract.js/src/**/*", "./node_modules/node-fetch/**/*"],
  },
  async headers() {
    return [{ source: "/:path*", headers: cabeceras }];
  },
};

export default nextConfig;
