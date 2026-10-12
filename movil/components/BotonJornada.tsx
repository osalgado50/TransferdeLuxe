// Jornada en el menú inferior (pestaña «Jornada»; también admite versión compacta): muestra el estado y, al tocarla, ofrece iniciar, pausar,
// reanudar o finalizar. Así la pantalla principal empieza directamente por los servicios de hoy.
import { formatoDuracion, rangosJornada, resumenConductor, type AccionJornada, type Jornada } from "@dominio/jornada";
import { leerModulos } from "@dominio/modulos";
import { useEffect, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { llamarApi } from "~/lib/api";
import { avisarCambioJornada } from "~/lib/jornada";
import { supabase } from "~/lib/supabase";
import { color } from "~/lib/tema";
import { useConsulta } from "~/lib/tiempoReal";

export function BotonJornada({ yo, pestana = false }: { yo: string; pestana?: boolean }) {
  const { datos, recargar } = useConsulta(async () => {
    const r = rangosJornada(new Date());
    const [aj, jor] = await Promise.all([
      supabase.from("ajustes").select("modulos").eq("id", 1).maybeSingle(),
      supabase.from("jornadas").select("id,conductor_id,inicio,fin,pausas(inicio,fin)").eq("conductor_id", yo).or(`fin.is.null,fin.gte.${r.semana.desde}`).order("inicio"),
    ]);
    return { activo: leerModulos(aj.data?.modulos).jornada, jornadas: (jor.data ?? []) as Jornada[] };
  }, [yo]);
  const [ahora, setAhora] = useState(() => new Date());
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { const t = setInterval(() => setAhora(new Date()), 60_000); return () => clearInterval(t); }, []);
  if (!datos?.activo) return pestana ? <View style={{ flex: 1 }} /> : null;
  const r = resumenConductor(datos.jornadas, ahora);

  const hacer = async (a: AccionJornada) => {
    setOcupado(true);
    let error: string | null = null;
    try {
      const res = await llamarApi("/api/conductor/jornada", { method: "POST", body: { accion: a } });
      if (!res.ok) error = ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo guardar.";
    } catch { error = "Sin conexión. Inténtalo de nuevo."; }
    setOcupado(false);
    if (error) { Alert.alert("Jornada", error); return; }
    await recargar();
    avisarCambioJornada(); // la pantalla de Hoy decide si pide el checklist
    if (a === "finalizar") Alert.alert("Jornada finalizada", "Si has terminado, ponte «Fuera de servicio» con el interruptor de arriba para dejar de enviar GPS.");
  };
  const resumen = `Hoy: ${formatoDuracion(r.msHoy)} · Semana: ${formatoDuracion(r.msSemana)}`;
  const menu = () => {
    if (r.estado === "fuera") {
      Alert.alert("Iniciar jornada", `${resumen}\n\n¿Empiezas a trabajar ahora?`, [
        { text: "Cancelar", style: "cancel" }, { text: "Iniciar jornada", onPress: () => void hacer("iniciar") }]);
      return;
    }
    Alert.alert(r.estado === "en_pausa" ? "Jornada en pausa" : "Jornada en curso", resumen, [
      r.estado === "trabajando" ? { text: "Hacer una pausa", onPress: () => void hacer("pausa") } : { text: "Reanudar", onPress: () => void hacer("reanudar") },
      { text: "Finalizar jornada", style: "destructive", onPress: () => void hacer("finalizar") },
      { text: "Cancelar", style: "cancel" },
    ]);
  };
  const tono = r.estado === "trabajando" ? "#22c55e" : r.estado === "en_pausa" ? "#f59e0b" : color.marcaClaro;
  const texto = r.estado === "fuera" ? "▶ Jornada" : r.estado === "en_pausa" ? "⏸ Pausa" : `● ${formatoDuracion(r.msHoy)}`;
  if (pestana) {
    // Pestaña del menú inferior: icono + estado, mismo alto que las demás pestañas.
    const icono = r.estado === "fuera" ? "play-circle-outline" : r.estado === "en_pausa" ? "pause-circle-outline" : "time-outline";
    return (
      <Pressable onPress={menu} disabled={ocupado} accessibilityRole="button"
        accessibilityLabel={r.estado === "fuera" ? "Iniciar jornada" : `Jornada: ${r.estado === "en_pausa" ? "en pausa" : "trabajando"}. ${resumen}`}
        style={({ pressed }) => [e.pestana, pressed && { opacity: 0.6 }]}>
        {ocupado ? <ActivityIndicator color={tono} /> : <Ionicons name={icono} size={26} color={tono} />}
        <Text style={[e.pestanaTexto, { color: tono }]}>{r.estado === "fuera" ? "Jornada" : r.estado === "en_pausa" ? "En pausa" : formatoDuracion(r.msHoy)}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={menu} disabled={ocupado} accessibilityRole="button" hitSlop={8}
      accessibilityLabel={r.estado === "fuera" ? "Iniciar jornada" : `Jornada: ${r.estado === "en_pausa" ? "en pausa" : "trabajando"}. ${resumen}`}
      style={({ pressed }) => [e.boton, { borderColor: tono }, pressed && { opacity: 0.7 }]}>
      {ocupado ? <ActivityIndicator color={tono} /> : <Text style={[e.texto, { color: tono }]}>{texto}</Text>}
    </Pressable>
  );
}

const e = StyleSheet.create({
  boton: { minHeight: 44, minWidth: 92, paddingHorizontal: 12, borderWidth: 1.5, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  texto: { fontSize: 16, fontWeight: "800" },
  pestana: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 2, gap: 2 },
  pestanaTexto: { fontSize: 14, fontWeight: "700" },
});
