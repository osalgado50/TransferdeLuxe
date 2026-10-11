import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
// Registra la tarea de GPS en segundo plano al arrancar (también si el SO relanza la app sin interfaz).
import "~/lib/gpsTarea";
import { ProveedorSesion, useSesion } from "~/lib/sesion";
import { color } from "~/lib/tema";
import { useActualizaciones } from "~/lib/actualizaciones";
import { IntroArranque } from "~/components/IntroArranque";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

const tema = { ...DarkTheme, colors: { ...DarkTheme.colors, primary: color.marcaClaro, background: color.fondo, card: color.fondo } };

function Navegacion() {
  const { cargando, sesion, perfil } = useSesion();
  useEffect(() => { if (!cargando) SplashScreen.hideAsync(); }, [cargando]);
  return (
    <>
      {!cargando && <Rutas sesion={!!sesion} operador={perfil?.rol === "operador"} />}
      {/* Entrada animada encima: se funde cuando la sesión ya está cargada. */}
      <IntroArranque listo={!cargando} />
    </>
  );
}

function Rutas({ sesion, operador }: { sesion: boolean; operador: boolean }) {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.fondo } }}>
      <Stack.Protected guard={sesion}>
        <Stack.Screen name="(conductor)" />
      </Stack.Protected>
      {/* Modo central para operadores (el jefe); si además conduce, usa también las pantallas del conductor. */}
      <Stack.Protected guard={sesion && operador}>
        <Stack.Screen name="central" />
      </Stack.Protected>
      <Stack.Protected guard={!sesion}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  useActualizaciones();
  return (
    <ThemeProvider value={tema}>
      <ProveedorSesion>
        <StatusBar style="light" />
        <Navegacion />
      </ProveedorSesion>
    </ThemeProvider>
  );
}
