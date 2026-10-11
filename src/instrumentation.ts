/** Arranque del servidor Next: vigilante de push a la central (solo runtime Node, con service role, fuera de build/test). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NODE_ENV === "test" || process.env.VITEST) return;
  if (process.env.NEXT_PHASE === "phase-production-build" || process.env.VIGILANTE_PUSH === "off") return;
  const { arrancarVigilante } = await import("@/lib/vigilante");
  arrancarVigilante();
}
