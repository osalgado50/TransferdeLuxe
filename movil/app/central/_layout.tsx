import { Stack } from "expo-router";
import { View } from "react-native";
import { AvisosPush } from "~/components/AvisosPush";
import { DrenajeCola } from "~/components/DrenajeCola";
import { ServicioNuevo } from "~/components/ServicioNuevo";
import { ProveedorCentral } from "~/lib/central";
import { useSesion } from "~/lib/sesion";
import { color } from "~/lib/tema";

/** Modo central (operador). Si el jefe también conduce, monta además la cola GPS y el aviso de servicio nuevo del conductor. */
export default function LayoutCentral() {
  const { sesion, perfil } = useSesion();
  const yo = sesion?.user.id;
  const conduce = perfil?.conduce === true;
  return (
    <ProveedorCentral>
      <View style={{ flex: 1, backgroundColor: color.fondo }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.fondo } }}>
          <Stack.Screen name="(pestanas)" />
          <Stack.Screen name="ficha/[id]" />
        </Stack>
        {yo && <AvisosPush key={`p-${yo}`} yo={yo} central />}
        {yo && conduce && <DrenajeCola key={`d-${yo}`} conductorId={yo} />}
        {yo && conduce && <ServicioNuevo key={`n-${yo}`} yo={yo} />}
      </View>
    </ProveedorCentral>
  );
}
