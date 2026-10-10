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
      <Text style={estilos.ruta}>{s.origen_texto} → {s.destino_texto}</Text>
      <Text style={estilos.meta}>{s.pasajeros} pax · {s.maletas} maletas</Text>
      {(destacada || conDia) && (
        <Boton texto="Abrir" estilo={{ marginTop: 8 }} onPress={() => router.push(`/servicio/${s.id}`)} etiqueta={`Abrir servicio de las ${fmt(hora, s.fecha_hora_recogida)}`} />
      )}
    </Tarjeta>
  );
}
const estilos = StyleSheet.create({
  fila: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  hora: { color: color.texto, fontSize: 32, fontWeight: "800", fontVariant: ["tabular-nums"] },
  dia: { color: color.texto, fontSize: 18, fontWeight: "700" },
  ruta: { color: color.texto, fontSize: 17, marginTop: 4 },
  meta: { color: color.textoTenue, fontSize: 15 },
});
