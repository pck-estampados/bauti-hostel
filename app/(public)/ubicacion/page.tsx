import type { Metadata } from "next";
import { PageHero } from "@/app/components/page-hero";
import { getPublicSiteContent } from "@/app/lib/public-site-content";
import {
  generalWhatsappMessage,
  mapsEmbedHref,
  mapsHref,
  publicFullAddress,
  whatsappHref,
} from "@/app/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getPublicSiteContent();
  return {
    title: "Ubicación",
    description: `${content.name} está en ${publicFullAddress(content)}.`,
    alternates: { canonical: "/ubicacion" },
  };
}

export default async function LocationPage() {
  const content = await getPublicSiteContent();
  const fullAddress = publicFullAddress(content);
  const contactHref = whatsappHref(
    content.whatsapp,
    generalWhatsappMessage(content.name),
  );
  return (
    <main>
      <PageHero
        eyebrow={`${content.city} · ${content.province}`}
        title={`Encontranos en ${content.address}`}
        description="Abrí la dirección en Google Maps o escribinos antes de viajar para coordinar tu llegada."
        aside="Dirección confirmada"
      />
      <section className="section page-section">
        <div className="shell location-grid location-grid--page">
          <div className="map-embed map-embed--large">
            <iframe
              src={mapsEmbedHref(fullAddress)}
              title={`Mapa de ${content.name} en ${content.address}, ${content.city}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <div className="location-copy">
            <p className="eyebrow">Dirección</p>
            <h2>{fullAddress}</h2>
            <p>El check-in se realiza de {content.checkInFrom} a {content.checkInUntil} hs. Coordiná tu llegada antes de viajar.</p>
            <div className="stacked-actions">
              <a className="button button--dark" href={mapsHref(fullAddress)} target="_blank" rel="noreferrer">Cómo llegar</a>
              <a className="button button--ghost" href={contactHref} target="_blank" rel="noreferrer">Consultar por WhatsApp</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
