import type { Metadata } from "next";
import { PageHero } from "@/app/components/page-hero";
import {
  generalWhatsappHref,
  mapsEmbedHref,
  mapsHref,
  siteConfig,
} from "@/app/lib/site";

export const metadata: Metadata = {
  title: "Ubicación",
  description: "Hostel Bauti está en Uruguayana 235, Ezeiza, Provincia de Buenos Aires.",
};

export default function LocationPage() {
  return (
    <main>
      <PageHero
        eyebrow="Ezeiza · Buenos Aires"
        title="Encontranos en Uruguayana 235"
        description="Abrí la dirección en Google Maps o escribinos antes de viajar para coordinar tu llegada."
        aside="Dirección confirmada"
      />
      <section className="section page-section">
        <div className="shell location-grid location-grid--page">
          <div className="map-embed map-embed--large">
            <iframe
              src={mapsEmbedHref}
              title="Mapa de Hostel Bauti en Uruguayana 235, Ezeiza"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <div className="location-copy">
            <p className="eyebrow">Dirección</p>
            <h2>{siteConfig.address}</h2>
            <p>El check-in puede realizarse desde la mañana, sujeto a disponibilidad y coordinación previa.</p>
            <div className="stacked-actions">
              <a className="button button--dark" href={mapsHref} target="_blank" rel="noreferrer">Cómo llegar</a>
              <a className="button button--ghost" href={generalWhatsappHref} target="_blank" rel="noreferrer">Consultar por WhatsApp</a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
