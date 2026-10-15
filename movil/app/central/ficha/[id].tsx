import { accionAsignacion } from "@dominio/centralMovil";
import { preguntaDeshacer } from "@dominio/deshacer";
import { COLOR_CONEXION } from "@dominio/conexionConductor";
import { urlVuelo } from "@dominio/vuelos";
import { avisosCentral } from "@dominio/avisoCliente";
import { preguntaAsignarAusente } from "@dominio/ausencias";
import { preguntaAsignarFueraHorario } from "@dominio/horarios";
import { AvisoCliente } from "~/components/AvisoCliente";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BloqueDireccion } from "~/components/BloqueDireccion";
import { ChipPuntualidad } from "~/components/ChipPuntualidad";
import { EstadoBadge } from "~/components/EstadoBadge";
import { Aviso, Boton, Tarjeta } from "~/components/ui";
import { asignarServicio, deshacerPaso, leerSugerencias, useCentral, type SugerenciaCentral } from "~/lib/central";
import { fechaHora, fmt } from "~/lib/formato";
import { color } from "~/lib/tema";

const abrir = (url: string) => Linking.openURL(url).catch(() => Alert.alert("No se pudo abrir", "Comprueba que la app está instalada."));
const llamar = (tel: string) => abrir(`tel:${tel.replace(/[^\d+]/g, "")}`);

function Sugerencias({ lista, alElegir, enviando }: { lista: SugerenciaCentral[]; alElegir: (s: SugerenciaCentral) => void; enviando: string | null }) {
  if (!lista.length) return <Aviso texto="No hay conductores disponibles." />;
  return (
    <View style={{ gap: 10 }}>
      {lista.map((s, i) => {
        const detalle = [s.matricula, s.distanciaKm != null ? `${s.distanciaKm} km` : null, s.margenMin != null ? `margen ${s.margenMin} min` : null].filter(Boolean).join(" · ");
        return (
          <Pressable key={s.conductorId} disabled={!!enviando} onPress={() => alElegir(s)} accessibilityRole="button"
            accessibilityLabel={`Elegir a ${s.nombre}${s.apto ? "" : ", no recomendado"}. ${s.motivos.join(". ")}`}
            style={({ pressed }) => [estilos.sug, !s.apto && { opacity: 0.7 }, i === 0 && s.apto && { borderColor: "#22c55e", borderWidth: 2 }, pressed && { opacity: 0.6 }]}>
            <View style={estilos.cabFila}>
              <Text style={estilos.sugNombre}>{s.nombre}</Text>
              <Text style={[estilos.apto, { color: s.apto ? "#86efac" : "#fca5a5" }]}>{enviando === s.conductorId ? "Enviando…" : s.apto ? "Apto" : "No recomendado"}</Text>
            </View>
            {s.conexion && (
              // Verde = GPS activo y reciente (en línea); rojo = sin señal; gris = fuera de servicio.
              <View style={[estilos.conexion, { borderColor: COLOR_CONEXION[s.conexion.estado] }]}
                accessibilityLabel={s.conexion.texto}>
                <View style={[estilos.luz, { backgroundColor: COLOR_CONEXION[s.conexion.estado] }]} />
                <Text style={[estilos.conexionTexto, { color: COLOR_CONEXION[s.conexion.estado] }]}>{s.conexion.texto}</Text>
              </View>
            )}
            {!!detalle && <Text style={estilos.meta}>{detalle}</Text>}
            {s.motivos.map((m) => <Text key={m} style={estilos.motivo}>· {m}</Text>)}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function Ficha() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { datos, recargar } = useCentral();
  const s = datos && [...datos.alertas, ...datos.pendientes, ...datos.hoy].find((x) => x.id === id);
  const [sugs, setSugs] = useState<SugerenciaCentral[] | null>(null);
  const [cargandoSugs, setCargandoSugs] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const [deshaciendo, setDeshaciendo] = useState(false);

  if (!s) {
    return (
      <SafeAreaView style={estilos.pantalla}>
        <View style={estilos.contenido}>
          <Aviso texto={datos ? "Este servicio ya no está entre los pendientes ni los de hoy." : "Cargando…"} />
          <Boton texto="Volver" variante="secundario" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }
  const accion = accionAsignacion(s);
  const conductor = datos?.conductores.find((c) => c.id === s.conductor_id);
  const vuelo = s.numero_vuelo?.trim();

  const verSugerencias = async () => {
    setCargandoSugs(true); setError(null); setHecho(null);
    try { setSugs(await leerSugerencias(s.id)); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudieron cargar las sugerencias"); }
    finally { setCargandoSugs(false); }
  };
  // La central puede deshacer el último paso del conductor (p. ej. una DESCARGA pulsada sin querer), sin límite de tiempo.
  const pregunta = preguntaDeshacer(s.estado);
  const deshacer = () => {
    if (!pregunta) return;
    const hacer = async () => {
      setDeshaciendo(true); setError(null); setHecho(null);
      const e = await deshacerPaso(s.id, s.estado);
      setDeshaciendo(false);
      if (e) { setError(e); return; }
      setHecho("Paso deshecho");
      await recargar();
    };
    Alert.alert("Deshacer último paso", pregunta, [{ text: "No", style: "cancel" }, { text: "Sí, deshacer", onPress: () => void hacer() }]);
  };
  const elegir = (g: SugerenciaCentral) => {
    if (!accion) return;
    const hacer = async () => {
      setEnviando(g.conductorId); setError(null);
      const e = await asignarServicio(accion, s.id, g.conductorId, g.vehiculoId);
      setEnviando(null);
      if (e) { setError(e); return; }
      setSugs(null); setHecho(`${accion === "asignar" ? "Asignado" : "Reasignado"} a ${g.nombre}`);
      await recargar();
    };
    // Ausente (vacaciones, baja…) o fuera de su horario: el servidor no lo impide, pero se pregunta y queda registrado.
    Alert.alert(accion === "asignar" ? "Asignar servicio" : "Reasignar servicio",
      g.ausencia ? `${g.nombre}: ${preguntaAsignarAusente(g.ausencia)}`
        : g.fueraHorario ? `${g.nombre}: ${preguntaAsignarFueraHorario(g.fueraHorario)}`
        : `¿${accion === "asignar" ? "Asignar" : "Reasignar"} a ${g.nombre}?`,
      [{ text: "Cancelar", style: "cancel" }, { text: "Sí", onPress: () => void hacer() }]);
  };

  return (
    <SafeAreaView style={estilos.pantalla} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={estilos.contenido}>
        <Boton texto="‹ Volver" variante="texto" alto={44} estilo={{ alignSelf: "flex-start", paddingHorizontal: 0 }} onPress={() => router.back()} etiqueta="Volver" />
        <Tarjeta>
          <View style={estilos.cabFila}>
            <Text style={estilos.hora}>{fmt(fechaHora, s.fecha_hora_recogida)}</Text>
            <EstadoBadge estado={s.estado} />
          </View>
          <BloqueDireccion tipo="recogida" texto={s.origen_texto} grande={false} />
          <BloqueDireccion tipo="destino" texto={s.destino_texto} grande={false} />
          <Text style={estilos.meta}>{s.pasajeros} pax · {s.maletas} maletas{s.origen_pedido === "web" ? " · Reserva web" : ""}</Text>
          <Text style={estilos.dato}>Cliente: {s.cliente_nombre}</Text>
          <Text style={estilos.dato}>Conductor: {conductor?.nombre ?? "Sin asignar"}</Text>
          <ChipPuntualidad ind={datos?.puntualidad?.[s.id]} />
          {vuelo && <Text style={estilos.dato}>Vuelo: {vuelo}</Text>}
          {s.notas && <Text style={estilos.notas}>Notas: {s.notas}</Text>}
        </Tarjeta>
        {hecho && <Aviso texto={hecho} />}
        {error && <Aviso tipo="error" texto={error} />}
        {!!s.cliente_telefono && <Boton texto="Llamar al cliente" alto={60} onPress={() => llamar(s.cliente_telefono)} />}
        <AvisoCliente servicioId={s.id} estado={s.estado} recogida={s.fecha_hora_recogida} telefono={s.cliente_telefono} cliente={s.cliente_nombre}
          tipos={avisosCentral(s.estado, s.ultima_incidencia)} modo="central" />
        {!!conductor?.telefono && <Boton texto={`Llamar a ${conductor.nombre}`} variante="secundario" alto={60} onPress={() => llamar(conductor.telefono!)} />}
        {vuelo && <Boton texto="Ver vuelo" variante="secundario" onPress={() => abrir(urlVuelo(vuelo))} />}
        {pregunta && <Boton texto="↩ Deshacer último paso" variante="secundario" cargando={deshaciendo} onPress={deshacer} />}
        {accion && !sugs && (
          <Boton texto={accion === "asignar" ? "Asignar" : "Reasignar"} alto={64} cargando={cargandoSugs} onPress={verSugerencias} />
        )}
        {sugs && (
          <>
            <Text style={estilos.titulo} accessibilityRole="header">Elige conductor</Text>
            <Sugerencias lista={sugs} alElegir={elegir} enviando={enviando} />
            <Boton texto="Cancelar" variante="secundario" onPress={() => setSugs(null)} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  conexion: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", borderWidth: 1.5, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, backgroundColor: "rgba(0,0,0,0.25)" },
  luz: { width: 12, height: 12, borderRadius: 6 },
  conexionTexto: { fontSize: 15, fontWeight: "800" },
  pantalla: { flex: 1, backgroundColor: color.fondo },
  contenido: { padding: 16, gap: 12, paddingBottom: 40 },
  cabFila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  hora: { color: color.texto, fontSize: 22, fontWeight: "800" },
  ruta: { color: color.texto, fontSize: 18, marginTop: 4 },
  meta: { color: color.textoTenue, fontSize: 15 },
  dato: { color: color.textoSuave, fontSize: 16 },
  notas: { color: color.textoSuave, fontSize: 15, fontStyle: "italic" },
  titulo: { color: color.marcaClaro, fontSize: 22, fontWeight: "700", marginTop: 8 },
  sug: { borderWidth: 1, borderColor: color.borde, backgroundColor: color.tarjeta, borderRadius: 16, padding: 16, gap: 4, minHeight: 64 },
  sugNombre: { color: color.texto, fontSize: 19, fontWeight: "700", flex: 1 },
  apto: { fontSize: 14, fontWeight: "700" },
  motivo: { color: color.textoSuave, fontSize: 15 },
});
