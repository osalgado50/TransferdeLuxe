import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TransferdeLuxe Conductor", short_name: "TdL Conductor", start_url: "/conductor", scope: "/conductor",
    display: "standalone", background_color: "#0f172a", theme_color: "#0f172a", lang: "es",
    icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }],
  };
}
