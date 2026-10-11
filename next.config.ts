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
  async headers() {
    return [{ source: "/:path*", headers: cabeceras }];
  },
};

export default nextConfig;
