import { rangosConductor } from "@dominio/dias";
import { euros, fechaCorta, litros2 } from "@dominio/formato";
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { EstadoBadge } from "~/components/EstadoBadge";
import { Aviso, Tarjeta } from "~/components/ui";
import { fechaHora, fmt } from "~/lib/formato";
import { exigir, type ServicioLista } from "~/lib/servicios";
import { useSesion } from "~/lib/sesion";
import { supabase } from "~/lib/supabase";
import { color } from "~/lib/tema";
import { useConsulta } from "~/lib/tiempoReal";

type Ticket = { id: string; fecha: string; litros: number; importe: number };

export default function Historial() {
  const { sesion } = useSesion();
  const yo = sesion!.user.id;
  const { datos, error, cargando, recargar } = useConsulta(async () => {
    const r = rangosConductor(new Date()).historial;
    const [s, t] = await Promise.all([
      supabase.from("servicios").select("id,estado,fecha_hora_recogida,origen_texto,destino_texto")
        .eq("conductor_id", yo).gte("fecha_hora_recogida", r.desde).order("fecha_hora_recogida", { ascending: false }),
      supabase.from("tickets_combustible").select("id,fecha,litros,importe").eq("conductor_id", yo).gte("fecha", r.desdeDia)
        .order("fecha", { ascending: false }),
    ]);
    return { servicios: exigir(s) as Pick<ServicioLista, "id" | "estado" | "fecha_hora_recogida" | "origen_texto" | "destino_texto">[], tickets: exigir(t) as Ticket[] };
  }, [yo]);
  const [refrescando, setRefrescando] = useState(false);
  const tirar = async () => { setRefrescando(true); await recargar(); setRefrescando(false); };
  const servicios = datos?.servicios ?? [], tickets = datos?.tickets ?? [];
  return (
    <ScrollView contentContainerStyle={estilos.contenido}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={tirar} tintColor={color.marcaClaro} />}>
      <Text style={estilos.titulo} accessibilityRole="header">Últimos 7 días</Text>
      {error && <Aviso tipo="error" texto={`Error al cargar: ${error}`} />}
      <Text style={estilos.seccion}>Servicios</Text>
      {cargando ? <Aviso texto="Cargando…" /> : servicios.length === 0 ? <Text style={estilos.vacio}>Sin servicios en los últimos 7 días.</Text>
        : servicios.map((x) => (
          <Tarjeta key={x.id}>
            <View style={estilos.fila}><Text style={estilos.meta}>{fmt(fechaHora, x.fecha_hora_recogida)}</Text><EstadoBadge estado={x.estado} /></View>
            <Text style={estilos.texto}>{x.origen_texto} → {x.destino_texto}</Text>
          </Tarjeta>))}
      <Text style={estilos.seccion}>Tickets de combustible</Text>
      {!cargando && (tickets.length === 0 ? <Text style={estilos.vacio}>Sin tickets en los últimos 7 días.</Text>
        : tickets.map((x) => (
          <Tarjeta key={x.id}>
            <View style={estilos.fila}>
              <Text style={estilos.texto}>{fechaCorta(x.fecha)} · {litros2(Number(x.litros))}</Text>
              <Text style={[estilos.texto, { color: color.marcaClaro, fontWeight: "700" }]}>{euros(Number(x.importe))}</Text>
            </View>
          </Tarjeta>)))}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: 16, gap: 10, paddingBottom: 40 },
  titulo: { color: color.marcaClaro, fontSize: 24, fontWeight: "700" },
  seccion: { color: color.texto, fontSize: 19, fontWeight: "700", marginTop: 10 },
  fila: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  texto: { color: color.texto, fontSize: 16 },
  meta: { color: color.textoTenue, fontSize: 15 },
  vacio: { color: color.textoTenue, fontSize: 16 },
});
