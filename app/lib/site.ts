const configuredBasePrice = Number.parseInt(
  process.env.NEXT_PUBLIC_BASE_PRICE_ARS ?? "50000",
  10,
);

export const siteConfig = {
  name: "Hostel Bauti",
  shortLocation: "Ezeiza, Buenos Aires",
  address: "Uruguayana 235, Ezeiza, Provincia de Buenos Aires, Argentina",
  shortAddress: "Uruguayana 235, Ezeiza",
  whatsappDisplay: "+54 9 11 2806-4272",
  whatsappNumber: "5491128064272",
  instagramHandle: "@hostel_bauti.ar",
  instagramUrl: "https://www.instagram.com/hostel_bauti.ar/",
  initialBasePriceArs: Number.isFinite(configuredBasePrice)
    ? configuredBasePrice
    : 50_000,
  checkoutTime: "10:00",
} as const;

export const navigation = [
  { href: "/", label: "Inicio" },
  { href: "/habitaciones", label: "Habitaciones" },
  { href: "/servicios", label: "Servicios" },
  { href: "/galeria", label: "Galería" },
  { href: "/ubicacion", label: "Ubicación" },
  { href: "/preguntas-frecuentes", label: "Preguntas frecuentes" },
  { href: "/contacto", label: "Contacto" },
] as const;

export const confirmedAmenities = [
  {
    code: "DE",
    title: "Desayuno incluido",
    description: "El desayuno está incluido en la estadía.",
  },
  {
    code: "WF",
    title: "WiFi en todo el alojamiento",
    description: "WiFi disponible en todo el establecimiento.",
  },
  {
    code: "AC",
    title: "Agua caliente",
    description: "Agua caliente disponible para los huéspedes.",
  },
  {
    code: "PI",
    title: "Pileta para huéspedes",
    description: "La pileta puede ser utilizada durante la estadía.",
  },
  {
    code: "PA",
    title: "Patio",
    description: "Espacio exterior disponible para descansar y compartir.",
  },
  {
    code: "EC",
    title: "Espacios comunes",
    description: "Ambientes compartidos dentro del alojamiento.",
  },
  {
    code: "HP",
    title: "Habitaciones privadas",
    description: "Habitaciones de uso privado con baño compartido.",
  },
] as const;

export type PublicRoom = {
  slug: string;
  name: string;
  description: string;
  capacityLabel: string;
  bedsLabel: string;
  priceLabel: string;
  tone: "clay" | "sage" | "sand";
};

// Se completará únicamente con habitaciones confirmadas por Hostel Bauti.
// La UI maneja este estado vacío sin publicar inventario no confirmado.
export const publishedRooms: readonly PublicRoom[] = [];

export const confirmedSpaces = [
  {
    code: "01",
    title: "Habitaciones privadas",
    description: "Espacios de descanso privados con baños compartidos.",
    tone: "clay",
  },
  {
    code: "02",
    title: "Pileta",
    description: "Disponible para quienes se hospedan en Hostel Bauti.",
    tone: "pool",
  },
  {
    code: "03",
    title: "Patio",
    description: "Un espacio exterior para descansar durante la estadía.",
    tone: "sage",
  },
  {
    code: "04",
    title: "Espacios comunes",
    description: "Ambientes compartidos para disfrutar dentro del alojamiento.",
    tone: "sand",
  },
] as const;

export const faqs = [
  {
    question: "¿A qué hora es el check-out?",
    answer: "El check-out es hasta las 10:00 hs.",
  },
  {
    question: "¿Cuándo se puede realizar el check-in?",
    answer:
      "El ingreso puede realizarse desde la mañana, sujeto a disponibilidad y coordinación previa.",
  },
  {
    question: "¿El desayuno está incluido?",
    answer: "Sí, el desayuno está incluido.",
  },
  {
    question: "¿Hay WiFi?",
    answer: "Sí, hay WiFi disponible en todo el establecimiento.",
  },
  {
    question: "¿Hay pileta?",
    answer: "Sí, los huéspedes pueden utilizarla.",
  },
  {
    question: "¿Hay estacionamiento?",
    answer: "No contamos con estacionamiento propio.",
  },
  {
    question: "¿Las habitaciones tienen baño privado?",
    answer: "No. Las habitaciones no tienen baño privado.",
  },
  {
    question: "¿Se puede fumar?",
    answer:
      "Únicamente en espacios exteriores habilitados, como la entrada o el patio.",
  },
  {
    question: "¿Cómo puedo consultar disponibilidad?",
    answer: `A través del formulario de la web o mediante WhatsApp al ${siteConfig.whatsappDisplay}.`,
  },
] as const;

export function formatArs(value: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

export function whatsappHref(message: string) {
  return `https://wa.me/${siteConfig.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

export const generalWhatsappHref = whatsappHref(
  "Hola, quisiera consultar por alojamiento y disponibilidad en Hostel Bauti.",
);

export const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  siteConfig.address,
)}`;

export const mapsEmbedHref = `https://www.google.com/maps?q=${encodeURIComponent(
  siteConfig.address,
)}&output=embed`;
