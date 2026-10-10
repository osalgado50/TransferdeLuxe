import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
// Registra la tarea de GPS en segundo plano al arrancar (también si el SO relanza la app sin interfaz).
import "~/lib/gpsTarea";
import { ProveedorSesion, useSesion } from "~/lib/sesion";
import { color } from "~/lib/tema";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

const tema = { ...DarkTheme, colors: { ...DarkTheme.colors, primary: color.marcaClaro, background: color.fondo, card: color.fondo } };

function Navegacion() {
  const { cargando, sesion } = useSesion();
  useEffect(() => { if (!cargando) SplashScreen.hideAsync(); }, [cargando]);
  if (cargando) return null;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.fondo } }}>
      <Stack.Protected guard={!!sesion}>
        <Stack.Screen name="(conductor)" />
      </Stack.Protected>
      <Stack.Protected guard={!sesion}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={tema}>
      <ProveedorSesion>
        <StatusBar style="light" />
        <Navegacion />
      </ProveedorSesion>
    </ThemeProvider>
  );
}
