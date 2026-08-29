export const brand = {
  publicName: "Casa Albor",
  descriptor: "Casa boutique · Estadías & Experiencias",
  assets: {
    logo: "/brand/casa-albor-logo.png",
    logoCream: "/brand/casa-albor-logo-cream.png",
    isotipo: "/brand/casa-albor-isotipo.png",
    isotipoCream: "/brand/casa-albor-isotipo-cream.png",
  },
  instagram: {
    handle: "@hostel_bauti.ar",
    url: "https://www.instagram.com/hostel_bauti.ar/",
  },
} as const;

export const primaryNavigation = [
  { href: "/", label: "Inicio" },
  { href: "/#la-casa", label: "La Casa" },
  { href: "/habitaciones", label: "Habitaciones" },
  { href: "/servicios", label: "Espacios" },
  { href: "/galeria", label: "Galería" },
  { href: "/contacto", label: "Contacto" },
] as const;

export const footerNavigation = [
  ...primaryNavigation.slice(1),
  { href: "/ubicacion", label: "Ubicación" },
  { href: "/preguntas-frecuentes", label: "Preguntas frecuentes" },
] as const;
