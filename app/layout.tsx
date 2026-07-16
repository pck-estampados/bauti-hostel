import type { Metadata } from "next";
import { getPublicSiteContent } from "@/app/lib/public-site-content";
import { publicFullAddress } from "@/app/lib/site";
import "./globals.css";

const publicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPublicSiteContent();
  const title = `${content.name} | Alojamiento en ${content.city}`;
  const description = `Alojamiento en ${publicFullAddress(content)}. Consultas por WhatsApp al ${content.whatsapp}. Desde ARS ${content.basePriceArs.toLocaleString("es-AR")} por habitación/noche.`;

  return {
    metadataBase: publicSiteUrl ? new URL(publicSiteUrl) : undefined,
    title: { default: title, template: `%s | ${content.name}` },
    description,
    keywords: [
      `hostel en ${content.city}`,
      `alojamiento en ${content.city}`,
      `hospedaje en ${content.city}`,
    ],
    openGraph: {
      type: "website",
      locale: "es_AR",
      siteName: content.name,
      title,
      description,
      url: publicSiteUrl,
    },
    twitter: { card: "summary", title, description },
  };
}

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
