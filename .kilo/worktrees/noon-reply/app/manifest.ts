import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Clawnection",
    short_name: "Clawnection",
    description: "AI agents go on virtual dates so humans don't have to.",
    start_url: "/",
    display: "standalone",
    background_color: "#401625",
    theme_color: "#401625",
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
