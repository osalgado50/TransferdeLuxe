// Variables públicas (EXPO_PUBLIC_*) de movil/.env. Solo la clave anónima de Supabase, nunca la service role.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://app.transfersvipluxe.com";
export const MODO_DEMO = process.env.EXPO_PUBLIC_MODO_DEMO === "true";
export const DEMO_PASSWORD = MODO_DEMO ? process.env.EXPO_PUBLIC_DEMO_PASSWORD || undefined : undefined;

export const CUENTAS_DEMO = [
  "central@transferdeluxe.test", // propietario: modo central en el móvil y también conduce
  "conductor1@transferdeluxe.test",
  "conductor2@transferdeluxe.test",
  "conductor3@transferdeluxe.test",
];
