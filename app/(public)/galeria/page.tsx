import type { Metadata } from "next";
import { PageHero } from "@/app/components/page-hero";
import {
  confirmedSpaces,
  generalWhatsappHref,
  siteConfig,
} from "@/app/lib/site";

export const metadata: Metadata = {
  title: "Galería y espacios",
  description:
    "Conocé los espacios confirmados de Hostel Bauti: habitaciones privadas, pileta, patio y espacios comunes en Ezeiza.",
};

export default function GalleryPage() {
  return (
    <main>
      <PageHero
        eyebrow="Espacios del alojamiento"
        title="Conocé qué ofrece Hostel Bauti"
        description="Para ver fotografías actuales del alojamiento, visitá nuestro Instagram o pedinos imágenes por WhatsApp."
        aside="Contenido real"
      />
      <section className="section page-section">
        <div className="shell">
          <div className="space-grid space-grid--page">
            {confirmedSpaces.map((space) => (
              <article className={`space-card space-card--${space.tone}`} key={space.title}>
                <span>{space.code}</span>
                <div><h2>{space.title}</h2><p>{space.description}</p></div>
              </article>
            ))}
          </div>

          <div className="gallery-contact">
            <div>
              <p className="eyebrow">Imágenes actuales</p>
              <h2>¿Querés ver los espacios antes de reservar?</h2>
              <p>Consultanos y te compartimos información actual del alojamiento.</p>
            </div>
            <div className="button-row">
              <a className="button button--primary" href={generalWhatsappHref} target="_blank" rel="noreferrer">
                Pedir fotos por WhatsApp
              </a>
              <a className="button button--ghost" href={siteConfig.instagramUrl} target="_blank" rel="noreferrer">
                Ver Instagram
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
