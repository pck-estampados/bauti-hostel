import type { MetadataRoute } from "next";

const routes = ["", "/habitaciones", "/servicios", "/galeria", "/ubicacion", "/preguntas-frecuentes", "/contacto", "/reservar", "/politicas", "/privacidad", "/terminos"];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return routes.map((route) => ({ url: `${baseUrl}${route}`, changeFrequency: route === "" ? "weekly" : "monthly", priority: route === "" ? 1 : 0.7 }));
}
