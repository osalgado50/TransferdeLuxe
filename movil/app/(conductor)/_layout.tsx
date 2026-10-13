import { Stack } from "expo-router";
import { View } from "react-native";
import { AvisosPush } from "~/components/AvisosPush";
import { DrenajeCola } from "~/components/DrenajeCola";
import { ServicioNuevo } from "~/components/ServicioNuevo";
import { RecordatorioTurno } from "~/components/RecordatorioTurno";
import { useSesion } from "~/lib/sesion";
import { color } from "~/lib/tema";

export default function LayoutConductor() {
  const { sesion, perfil } = useSesion();
  // Para el operador, la cola, los avisos y el modal de servicio nuevo los monta el layout de la central (sin duplicar).
  const yo = perfil?.rol === "operador" ? undefined : sesion?.user.id;
  return (
    <View style={{ flex: 1, backgroundColor: color.fondo }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.fondo } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="servicio/[id]" />
      </Stack>
      {yo && <DrenajeCola key={`d-${yo}`} conductorId={yo} />}
      {yo && <AvisosPush key={`p-${yo}`} yo={yo} />}
      {yo && <ServicioNuevo key={`n-${yo}`} yo={yo} />}
      {yo && <RecordatorioTurno key={`t-${yo}`} yo={yo} />}
    </View>
  );
}
