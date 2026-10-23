import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Oja Vendor Hub",
    short_name: "Oja",
    description: "Waitlists, restock alerts, one inbox and a rep scorecard for Instagram and WhatsApp vendors.",
    start_url: "/app",
    display: "standalone",
    background_color: "#f4f5f9",
    theme_color: "#2c3b8f",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
