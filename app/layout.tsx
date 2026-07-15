import type { Metadata } from "next";
import "./globals.css";

const publicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  metadataBase: publicSiteUrl ? new URL(publicSiteUrl) : undefined,
  title: {
    default: "Hostel Bauti | Alojamiento en Ezeiza",
    template: "%s | Hostel Bauti",
  },
  description:
    "Hostel con habitaciones privadas, desayuno incluido, WiFi, patio y pileta en Ezeiza, Provincia de Buenos Aires.",
  keywords: [
    "hostel en Ezeiza",
    "alojamiento en Ezeiza",
    "habitaciones en Ezeiza",
    "hospedaje en Ezeiza",
    "alojamiento con pileta en Ezeiza",
  ],
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "Hostel Bauti",
    title: "Hostel Bauti | Alojamiento en Ezeiza",
    description:
      "Habitaciones privadas, desayuno incluido y espacios para disfrutar en Ezeiza.",
    url: publicSiteUrl,
  },
  twitter: { card: "summary" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
