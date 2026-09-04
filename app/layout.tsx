import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";
import { brand } from "@/app/lib/brand";
import { getPublicSiteContent } from "@/app/lib/public-site-content";
import { publicFullAddress } from "@/app/lib/site";
import "./globals.css";

const publicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const displayFont = Cormorant_Garamond({
  variable: "--font-albor-display",
  subsets: ["latin"],
  weight: "variable",
  style: ["normal", "italic"],
  display: "swap",
});
const bodyFont = Manrope({
  variable: "--font-albor-body",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#F5EADF",
};

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPublicSiteContent();
  const title = `${content.name} | Casa boutique en ${content.city}`;
  const description = `${content.descriptor} en ${publicFullAddress(content)}. Consultá condiciones y tarifas según categoría y fechas.`;

  return {
    // Private development release; commercial indexing requires a separate approval.
    robots: { index: false, follow: false },
    metadataBase: publicSiteUrl ? new URL(publicSiteUrl) : undefined,
    applicationName: content.name,
    title: { default: title, template: `%s | ${content.name}` },
    description,
    keywords: [
      `casa boutique en ${content.city}`,
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
      images: [{
        url: brand.assets.logoCream,
        width: 1000,
        height: 1000,
        alt: brand.publicName,
      }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [brand.assets.logoCream],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${displayFont.variable} ${bodyFont.variable}`}>
        {children}
      </body>
    </html>
  );
}
