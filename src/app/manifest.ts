import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TVL VIP Transfers · Conductor", short_name: "TVL Conductor", start_url: "/conductor", scope: "/conductor",
    display: "standalone", background_color: "#0b1b2e", theme_color: "#0b1b2e", lang: "es",
    icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }],
  };
}
