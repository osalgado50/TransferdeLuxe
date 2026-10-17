import { rangosConductor } from "@dominio/dias";
import { devolviblesEnBloque } from "@dominio/estados";
import { useEffect, useState } from "react";
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { ModulosConductor } from "~/components/ModulosConductor";
import { DevolverRapido } from "~/components/DevolverRapido";
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
    const [hoy, prox, antes] = await Promise.all([
      supabase.from("servicios").select(CAMPOS_LISTA).eq("es_prueba", false).eq("conductor_id", yo)
        .gte("fecha_hora_recogida", r.hoy.desde).lt("fecha_hora_recogida", r.hoy.hasta).neq("estado", "cancelado").order("fecha_hora_recogida"),
      supabase.from("servicios").select(CAMPOS_LISTA).eq("es_prueba", false).eq("conductor_id", yo)
        .gte("fecha_hora_recogida", r.proximos.desde).lt("fecha_hora_recogida", r.proximos.hasta)
        .not("estado", "in", "(cancelado,completado)").order("fecha_hora_recogida"),
      // Sin terminar de días anteriores (hasta 2 semanas): antes no se veían y podían dejar la app enganchada.
      supabase.from("servicios").select(CAMPOS_LISTA).eq("es_prueba", false).eq("conductor_id", yo)
        .gte("fecha_hora_recogida", new Date(Date.parse(r.hoy.desde) - 14 * 86400e3).toISOString()).lt("fecha_hora_recogida", r.hoy.desde)
        .in("estado", ["asignado", "aceptado", "en_camino", "recogido"]).order("fecha_hora_recogida"),
    ]);
    return { hoy: exigir(hoy) as ServicioLista[], prox: exigir(prox) as ServicioLista[], antes: exigir(antes) as ServicioLista[] };
  }, [yo, r.hoy.desde]);
  const [refrescando, setRefrescando] = useState(false);
  const tirar = async () => { setRefrescando(true); await recargar(); setRefrescando(false); };

  // Devueltos desde la lista: se quitan ya (la cola los envía; al recargar ya no son suyos).
  const [devueltos, setDevueltos] = useState<Set<string>>(new Set());
  const fuera = (l: ServicioLista[] | undefined) => (l ?? []).filter((s) => !devueltos.has(s.id));
  const alDevolver = (ids: string[]) => { setDevueltos((d) => new Set([...d, ...ids])); setTimeout(() => void recargar(), 1500); };
  // Enviados o rechazados: deja de ocultarlos y recarga (si el servidor la rechazó, el servicio sigue siendo suyo y vuelve).
  const alResolver = (ids: string[]) => { void recargar().then(() => setDevueltos((d) => new Set([...d].filter((id) => !ids.includes(id))))); };
  const hoy = fuera(datos?.hoy);
  const prox = fuera(datos?.prox);
  const antes = fuera(datos?.antes);
  const enBloque = devolviblesEnBloque([antes, hoy, prox]);
  const siguiente = hoy.find((s) => s.estado !== "completado")?.id;
  return (
    <ScrollView contentContainerStyle={estilos.contenido}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={tirar} tintColor={color.marcaClaro} />}>
      {antes.length > 0 && (
        <>
          <Text style={[estilos.titulo, { color: "#fcd34d" }]} accessibilityRole="header">De días anteriores, sin terminar</Text>
          <Text style={estilos.ayuda}>Termínalos o devuélvelos a la central con la ✕.</Text>
          {antes.map((s) => <TarjetaServicio key={s.id} s={s} conDia yo={yo} alDevolver={alDevolver} alResolver={alResolver} />)}
        </>
      )}
      {/* Lo primero, las órdenes de trabajo de hoy; el checklist debajo (si toca); privacidad al final. Jornada e incidencias: pestaña «Jornada». */}
      <Text style={estilos.titulo} accessibilityRole="header">Hoy</Text>
      {error && <Aviso tipo="error" texto={`Error al cargar: ${error}. Desliza hacia abajo para reintentar.`} />}
      {cargando ? <Aviso texto="Cargando…" />
        : hoy.length === 0 ? <Text style={estilos.vacio}>No tienes servicios para hoy.</Text>
        : hoy.map((s) => <TarjetaServicio key={s.id} s={s} destacada={s.id === siguiente} yo={yo} alDevolver={alDevolver} alResolver={alResolver} />)}
      <View style={{ marginTop: 12 }}><ModulosConductor /></View>
      <Text style={[estilos.titulo, { marginTop: 16 }]} accessibilityRole="header">Próximos días</Text>
      {!cargando && (prox.length === 0
        ? <Text style={estilos.vacio}>No tienes servicios en los próximos 7 días.</Text>
        : prox.map((s) => <TarjetaServicio key={s.id} s={s} conDia yo={yo} alDevolver={alDevolver} alResolver={alResolver} />))}
      {/* Cuando se acumulan: todos de vuelta a la central para que los redistribuya (con el cliente a bordo, no). */}
      {!cargando && <View style={{ marginTop: 12 }}><DevolverRapido conductorId={yo} servicios={enBloque} enBloque alDevolver={alDevolver} alResolver={alResolver} /></View>}
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
  ayuda: { color: color.textoSuave, fontSize: 15, marginTop: -4 },
});
