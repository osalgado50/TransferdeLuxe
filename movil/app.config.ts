import type { ExpoConfig } from "expo/config";

// Identidad y permisos de «TVL Conductor». Las carpetas ios/ y android/ se generan en EAS (CNG): no se versionan.
const config: ExpoConfig = {
  name: "TVL Conductor",
  slug: "tvl-conductor",
  owner: "osalgado",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "tvlconductor",
  userInterfaceStyle: "dark",
  backgroundColor: "#0b1b2e",
  ios: {
    bundleIdentifier: "com.transfersvipluxe.conductor",
    supportsTablet: false,
    infoPlist: {
      // Ubicación: textos y modo «location» los añade el plugin expo-location (abajo).
      UIBackgroundModes: ["location", "remote-notification"],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "com.transfersvipluxe.conductor",
    adaptiveIcon: {
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundColor: "#0167a9",
    },
    // Permisos de ubicación y servicio en primer plano: los declara el plugin expo-location.
    predictiveBackGestureEnabled: false,
  },
  web: { bundler: "metro", output: "single", favicon: "./assets/images/favicon.png" },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      { image: "./assets/images/splash-icon.png", imageWidth: 200, resizeMode: "contain", backgroundColor: "#0b1b2e" },
    ],
    "expo-image",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "TVL Conductor usa tu ubicación para que la central vea dónde estás mientras estás en servicio.",
        locationAlwaysAndWhenInUsePermission:
          "Para seguir enviando tu posición a la central con la pantalla bloqueada, permite el acceso a la ubicación «Siempre» mientras estés en servicio.",
        locationAlwaysPermission:
          "Para seguir enviando tu posición a la central con la pantalla bloqueada, permite el acceso a la ubicación «Siempre» mientras estés en servicio.",
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: { eas: { projectId: "c5b7d38c-6dc1-45c7-ad61-dc2190b2ff34" } },
};

export default config;
