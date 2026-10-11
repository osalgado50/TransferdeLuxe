import { rangosConductor } from "@dominio/dias";
import { euros, fechaCorta, litros2 } from "@dominio/formato";
import { CAMPOS_RECORRIDO, COLOR_CON, COLOR_HACIA, textoDuracion, textoKm, type RecorridoGuardado } from "@dominio/recorrido";
import { useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EstadoBadge } from "~/components/EstadoBadge";
import { MapaRecorrido } from "~/components/MapaRecorrido";
import { MiniRecorrido } from "~/components/MiniRecorrido";
import { Aviso, Boton, Tarjeta } from "~/components/ui";
import { fechaHora, fmt } from "~/lib/formato";
import { exigir, type ServicioLista } from "~/lib/servicios";
import { useSesion } from "~/lib/sesion";
import { supabase } from "~/lib/supabase";
import { color } from "~/lib/tema";
import { useConsulta } from "~/lib/tiempoReal";

type Ticket = { id: string; fecha: string; litros: number; importe: number };
type Viaje = Pick<ServicioLista, "id" | "estado" | "fecha_hora_recogida" | "origen_texto" | "destino_texto"> & { recorrido: RecorridoGuardado | null };

/** Mapa grande del viaje, con km y duración. */
function RutaViaje({ viaje, cerrar }: { viaje: Viaje | null; cerrar: () => void }) {
  const { top, bottom } = useSafeAreaInsets();
  const r = viaje?.recorrido;
  const conPax = r?.km_con_pasajeros != null ? Number(r.km_con_pasajeros) : null;
  return (
    <Modal visible={!!viaje} animationType="slide" onRequestClose={cerrar}>
      <ScrollView style={{ backgroundColor: color.fondo }} contentContainerStyle={[estilos.contenido, { paddingTop: top + 12, paddingBottom: bottom + 24 }]}>
        {viaje && r && <>
          <Text style={estilos.titulo} accessibilityRole="header">Ruta del viaje</Text>
          <Text style={estilos.meta}>{fmt(fechaHora, viaje.fecha_hora_recogida)}</Text>
          <Text style={estilos.texto}>{viaje.origen_texto} → {viaje.destino_texto}</Text>
          <Text style={estilos.cifras}>{textoKm(r.km)} · {textoDuracion(r.duracion_min)}</Text>
          {r.puntos.length >= 2 ? <MapaRecorrido puntos={r.puntos} corte={r.corte} />
            : <Text style={estilos.vacio}>No hay posiciones GPS de este viaje (el GPS no estaba activo).</Text>}
          {r.puntos.length >= 2 && (
            <View style={{ gap: 4 }}>
              <View style={estilos.leyenda}><View style={[estilos.raya, { backgroundColor: COLOR_HACIA }]} /><Text style={estilos.meta}>Hacia la recogida{conPax != null ? ` · ${textoKm(Number(r.km) - conPax)}` : ""}</Text></View>
              {r.corte != null && <View style={estilos.leyenda}><View style={[estilos.raya, { backgroundColor: COLOR_CON }]} /><Text style={estilos.meta}>Con pasajeros{conPax != null ? ` · ${textoKm(conPax)}` : ""}</Text></View>}
            </View>
          )}
        </>}
        <Boton texto="Cerrar" variante="secundario" onPress={cerrar} />
      </ScrollView>
    </Modal>
  );
}

export default function Historial() {
  const { sesion } = useSesion();
  const yo = sesion!.user.id;
  const { datos, error, cargando, recargar } = useConsulta(async () => {
    const r = rangosConductor(new Date()).historial;
    const [s, t] = await Promise.all([
      supabase.from("servicios").select(`id,estado,fecha_hora_recogida,origen_texto,destino_texto,recorrido:recorridos(${CAMPOS_RECORRIDO})`)
        .eq("conductor_id", yo).gte("fecha_hora_recogida", r.desde).order("fecha_hora_recogida", { ascending: false }),
      supabase.from("tickets_combustible").select("id,fecha,litros,importe").eq("conductor_id", yo).gte("fecha", r.desdeDia)
        .order("fecha", { ascending: false }),
    ]);
    return { servicios: exigir(s) as unknown as Viaje[], tickets: exigir(t) as Ticket[] };
  }, [yo]);
  const [refrescando, setRefrescando] = useState(false);
  const [abierto, setAbierto] = useState<Viaje | null>(null);
  const tirar = async () => { setRefrescando(true); await recargar(); setRefrescando(false); };
  const servicios = datos?.servicios ?? [], tickets = datos?.tickets ?? [];
  return (
    <ScrollView contentContainerStyle={estilos.contenido}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={tirar} tintColor={color.marcaClaro} />}>
      <Text style={estilos.titulo} accessibilityRole="header">Últimos 7 días</Text>
      {error && <Aviso tipo="error" texto={`Error al cargar: ${error}`} />}
      <Text style={estilos.seccion}>Servicios</Text>
      {cargando ? <Aviso texto="Cargando…" /> : servicios.length === 0 ? <Text style={estilos.vacio}>Sin servicios en los últimos 7 días.</Text>
        : servicios.map((x) => {
          const datos = <>
            <View style={estilos.fila}><Text style={estilos.meta}>{fmt(fechaHora, x.fecha_hora_recogida)}</Text><EstadoBadge estado={x.estado} /></View>
            <Text style={estilos.texto}>{x.origen_texto} → {x.destino_texto}</Text>
          </>;
          // Solo hay ruta que dibujar con al menos 2 posiciones GPS.
          const r = (x.recorrido?.puntos.length ?? 0) >= 2 ? x.recorrido : null;
          if (!r) return <Tarjeta key={x.id}>{datos}</Tarjeta>;
          // Completado con recorrido: dibujo de la ruta; al tocar, el mapa grande con km y duración.
          return (
            <Pressable key={x.id} onPress={() => setAbierto(x)} accessibilityRole="button" accessibilityLabel={`Ver la ruta: ${x.origen_texto} a ${x.destino_texto}`}
              style={({ pressed }) => pressed && { opacity: 0.8 }}>
              <Tarjeta>
                {datos}
                <View style={estilos.filaRuta}>
                  <MiniRecorrido puntos={r.puntos} corte={r.corte} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={estilos.cifras}>{textoKm(r.km)}</Text>
                    <Text style={estilos.meta}>{textoDuracion(r.duracion_min)} · ver ruta ›</Text>
                  </View>
                </View>
              </Tarjeta>
            </Pressable>);
        })}
      <Text style={estilos.seccion}>Tickets de combustible</Text>
      {!cargando && (tickets.length === 0 ? <Text style={estilos.vacio}>Sin tickets en los últimos 7 días.</Text>
        : tickets.map((x) => (
          <Tarjeta key={x.id}>
            <View style={estilos.fila}>
              <Text style={estilos.texto}>{fechaCorta(x.fecha)} · {litros2(Number(x.litros))}</Text>
              <Text style={[estilos.texto, { color: color.marcaClaro, fontWeight: "700" }]}>{euros(Number(x.importe))}</Text>
            </View>
          </Tarjeta>)))}
      <RutaViaje viaje={abierto} cerrar={() => setAbierto(null)} />
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
  filaRuta: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 },
  cifras: { color: color.marcaClaro, fontSize: 20, fontWeight: "800" },
  leyenda: { flexDirection: "row", alignItems: "center", gap: 8 },
  raya: { width: 22, height: 4, borderRadius: 2 },
});
