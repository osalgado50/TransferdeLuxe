// Icono de la pestaña «Jornada» según el estado: ▶ sin iniciar, reloj trabajando, ⏸ en pausa (consulta ligera de la
// jornada abierta; se actualiza cuando la pantalla Jornada la cambia).
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect } from "react";
import type { ColorValue } from "react-native";
import { alCambiarJornada } from "~/lib/jornada";
import { supabase } from "~/lib/supabase";
import { useConsulta } from "~/lib/tiempoReal";

export function IconoJornada({ yo, color, size }: { yo: string; color: ColorValue; size: number }) {
  const { datos, recargar } = useConsulta(async () => {
    const { data } = await supabase.from("jornadas").select("id,pausas(fin)").eq("conductor_id", yo).is("fin", null).maybeSingle();
    if (!data) return "fuera" as const;
    return ((data.pausas ?? []) as { fin: string | null }[]).some((p) => !p.fin) ? "en_pausa" as const : "trabajando" as const;
  }, [yo]);
  useEffect(() => alCambiarJornada(() => void recargar()), [recargar]);
  const nombre = datos === "trabajando" ? "time" : datos === "en_pausa" ? "pause-circle-outline" : "time-outline";
  const tinta = datos === "trabajando" ? "#4ade80" : datos === "en_pausa" ? "#fbbf24" : (color as string);
  return <Ionicons name={nombre} color={tinta} size={size + 2} />;
}
