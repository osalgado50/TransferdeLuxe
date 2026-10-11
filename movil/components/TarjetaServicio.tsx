import { direccionCorta } from "@dominio/direccion";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { EstadoBadge } from "./EstadoBadge";
import { Boton, Tarjeta } from "./ui";
import { diaHora, fmt, hora } from "~/lib/formato";
import type { ServicioLista } from "~/lib/servicios";
import { color } from "~/lib/tema";

export function TarjetaServicio({ s, destacada, conDia }: { s: ServicioLista; destacada?: boolean; conDia?: boolean }) {
  return (
    <Tarjeta destacada={destacada} apagada={s.estado === "completado"}>
      <View style={estilos.fila}>
        <Text style={conDia ? estilos.dia : estilos.hora}>{fmt(conDia ? diaHora : hora, s.fecha_hora_recogida)}</Text>
        <EstadoBadge estado={s.estado} />
      </View>
      <Linea tipo="recogida" texto={s.origen_texto} />
      <Linea tipo="destino" texto={s.destino_texto} />
      <Text style={estilos.meta}>{s.pasajeros} pax · {s.maletas} maletas</Text>
      {(destacada || conDia) && (
        <Boton texto="Abrir" estilo={{ marginTop: 8 }} onPress={() => router.push(`/servicio/${s.id}`)} etiqueta={`Abrir servicio de las ${fmt(hora, s.fecha_hora_recogida)}`} />
      )}
    </Tarjeta>
  );
}
/** Versión compacta del recuadro de dirección: rojo = recogida, verde = destino. */
function Linea({ tipo, texto }: { tipo: "recogida" | "destino"; texto: string }) {
  const d = direccionCorta(texto);
  const rojo = tipo === "recogida";
  return (
    <View style={[estilos.linea, { backgroundColor: rojo ? "rgba(220,38,38,0.2)" : "rgba(22,163,74,0.2)", borderLeftColor: rojo ? "#ef4444" : "#22c55e" }]}>
      <Text style={[estilos.lineaTitulo, { color: rojo ? "#fca5a5" : "#86efac" }]}>{rojo ? "RECOGIDA" : "DESTINO"}</Text>
      <Text style={estilos.lineaTexto} numberOfLines={2}>{d.principal}{d.localidad ? ` · ${d.localidad}` : ""}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  linea: { borderLeftWidth: 5, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginTop: 6 },
  lineaTitulo: { fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  lineaTexto: { color: "#fff", fontSize: 17, fontWeight: "700" },
  fila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  hora: { color: color.texto, fontSize: 32, fontWeight: "800", fontVariant: ["tabular-nums"] },
  dia: { color: color.texto, fontSize: 18, fontWeight: "700" },
  meta: { color: color.textoTenue, fontSize: 15 },
});
