import { Stack } from "expo-router";
import { View } from "react-native";
import { AvisosPush } from "~/components/AvisosPush";
import { DrenajeCola } from "~/components/DrenajeCola";
import { ServicioNuevo } from "~/components/ServicioNuevo";
import { useSesion } from "~/lib/sesion";
import { color } from "~/lib/tema";

export default function LayoutConductor() {
  const { sesion } = useSesion();
  const yo = sesion?.user.id;
  return (
    <View style={{ flex: 1, backgroundColor: color.fondo }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.fondo } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="servicio/[id]" />
      </Stack>
      {yo && <DrenajeCola key={`d-${yo}`} conductorId={yo} />}
      {yo && <AvisosPush key={`p-${yo}`} yo={yo} />}
      {yo && <ServicioNuevo key={`n-${yo}`} yo={yo} />}
    </View>
  );
}
