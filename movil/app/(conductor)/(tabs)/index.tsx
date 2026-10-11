import { rangosConductor } from "@dominio/dias";
import { useEffect, useState } from "react";
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { ModulosConductor } from "~/components/ModulosConductor";
import { TarjetaServicio } from "~/components/TarjetaServicio";
import { Aviso } from "~/components/ui";
import { CAMPOS_LISTA, exigir, type ServicioLista } from "~/lib/servicios";
import { useSesion } from "~/lib/sesion";
import { supabase } from "~/lib/supabase";
import { color } from "~/lib/tema";
import { useConsulta } from "~/lib/tiempoReal";

// A medianoche (Madrid) cambia el día: se recalculan los rangos.
function useRangos() {
  const [r, setR] = useState(() => rangosConductor(new Date()));
  useEffect(() => {
    const t = setTimeout(() => setR(rangosConductor(new Date())), Math.max(1000, Date.parse(r.hoy.hasta) - Date.now() + 1000));
    return () => clearTimeout(t);
  }, [r]);
  return r;
}

export default function Hoy() {
  const { sesion } = useSesion();
  const yo = sesion!.user.id;
  const r = useRangos();
  const { datos, error, cargando, recargar } = useConsulta(async () => {
    const [hoy, prox] = await Promise.all([
      supabase.from("servicios").select(CAMPOS_LISTA).eq("es_prueba", false).eq("conductor_id", yo)
        .gte("fecha_hora_recogida", r.hoy.desde).lt("fecha_hora_recogida", r.hoy.hasta).neq("estado", "cancelado").order("fecha_hora_recogida"),
      supabase.from("servicios").select(CAMPOS_LISTA).eq("es_prueba", false).eq("conductor_id", yo)
        .gte("fecha_hora_recogida", r.proximos.desde).lt("fecha_hora_recogida", r.proximos.hasta)
        .not("estado", "in", "(cancelado,completado)").order("fecha_hora_recogida"),
    ]);
    return { hoy: exigir(hoy) as ServicioLista[], prox: exigir(prox) as ServicioLista[] };
  }, [yo, r.hoy.desde]);
  const [refrescando, setRefrescando] = useState(false);
  const tirar = async () => { setRefrescando(true); await recargar(); setRefrescando(false); };

  const hoy = datos?.hoy ?? [];
  const prox = datos?.prox ?? [];
  const siguiente = hoy.find((s) => s.estado !== "completado")?.id;
  return (
    <ScrollView contentContainerStyle={estilos.contenido}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={tirar} tintColor={color.marcaClaro} />}>
      {/* Lo primero, las órdenes de trabajo de hoy; jornada, checklist e incidencias debajo; privacidad al final. */}
      <Text style={estilos.titulo} accessibilityRole="header">Hoy</Text>
      {error && <Aviso tipo="error" texto={`Error al cargar: ${error}. Desliza hacia abajo para reintentar.`} />}
      {cargando ? <Aviso texto="Cargando…" />
        : hoy.length === 0 ? <Text style={estilos.vacio}>No tienes servicios para hoy.</Text>
        : hoy.map((s) => <TarjetaServicio key={s.id} s={s} destacada={s.id === siguiente} />)}
      <View style={{ marginTop: 12 }}><ModulosConductor /></View>
      <Text style={[estilos.titulo, { marginTop: 16 }]} accessibilityRole="header">Próximos días</Text>
      {!cargando && (prox.length === 0
        ? <Text style={estilos.vacio}>No tienes servicios en los próximos 7 días.</Text>
        : prox.map((s) => <TarjetaServicio key={s.id} s={s} conDia />))}
      <Text accessibilityRole="link" onPress={() => void Linking.openURL("https://app.transfersvipluxe.com/privacidad")} style={estilos.privacidad}>
        Política de privacidad
      </Text>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  privacidad: { color: color.textoTenue, fontSize: 13, textAlign: "center", textDecorationLine: "underline", marginTop: 32, paddingVertical: 8 },
  contenido: { padding: 16, gap: 12, paddingBottom: 40 },
  titulo: { color: color.marcaClaro, fontSize: 24, fontWeight: "700" },
  vacio: { color: color.textoTenue, fontSize: 16, textAlign: "center", paddingVertical: 24 },
});
