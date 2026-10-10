import { Stack } from "expo-router";
import { color } from "~/lib/tema";

export default function LayoutConductor() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.fondo } }} />;
}
