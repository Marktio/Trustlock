import type { MetadataRoute } from "next";

/** Lets a phone offer "Add to home screen" and show TrustLock full-screen with its own icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TrustLock",
    short_name: "TrustLock",
    description: "A practice escrow for freelance jobs. Simulation only: no real money.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f5f9",
    theme_color: "#111b33",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
