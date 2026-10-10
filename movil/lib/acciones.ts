import { crearEnviarAccion } from "@/lib/offline/accionApi";
import * as Crypto from "expo-crypto";
import { API_URL } from "./config";
import { supabase } from "./supabase";

/** POST /api/conductor/accion con el JWT de la sesión (401 → refresca y reintenta una vez). */
export const enviarAccion = crearEnviarAccion({
  apiUrl: API_URL,
  token: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
  refrescar: async () => (await supabase.auth.refreshSession()).data.session?.access_token ?? null,
  fetch: (...a) => fetch(...a),
});

export const nuevoIdAccion = () => Crypto.randomUUID();
