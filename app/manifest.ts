import type { MetadataRoute } from "next";
import { brand } from "@/app/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.publicName,
    short_name: brand.publicName,
    description: brand.descriptor,
    start_url: "/",
    display: "standalone",
    background_color: "#F5EADF",
    theme_color: "#636B4F",
    icons: [
      {
        src: brand.assets.isotipo,
        sizes: "1000x1000",
        type: "image/png",
      },
    ],
  };
}
