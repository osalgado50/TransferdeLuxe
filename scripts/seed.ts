import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { sembrarDemo } from "../src/lib/demo/seed";

config({ path: ".env.local" });

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, clave = process.env.SUPABASE_SERVICE_ROLE_KEY, pass = process.env.DEMO_PASSWORD;
  if (!url || !clave || !pass) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o DEMO_PASSWORD en .env.local");
  await sembrarDemo(createClient(url, clave, { auth: { persistSession: false } }), pass);
  console.log("Demo sembrada.");
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
