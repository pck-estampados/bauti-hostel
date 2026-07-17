import type { Metadata } from "next";
import Image from "next/image";
import { PageHero } from "@/app/components/page-hero";
import { MEDIA_CATEGORY_LABELS } from "@/app/lib/media-types";
import { getPublicGallery } from "@/app/lib/public-gallery";
import { getPublicSiteContent } from "@/app/lib/public-site-content";
import {
  generalWhatsappMessage,
  socialConfig,
  whatsappHref,
} from "@/app/lib/site";

export const metadata: Metadata = {
  title: "Galería",
  alternates: { canonical: "/galeria" },
  description:
    "Fotografías reales publicadas por Hostel Bauti en Ezeiza, Buenos Aires.",
};

export default async function GalleryPage() {
  const [content, gallery] = await Promise.all([
    getPublicSiteContent(),
    getPublicGallery(),
  ]);
  const contactHref = whatsappHref(
    content.whatsapp,
    generalWhatsappMessage(content.name),
  );

  return (
    <main>
      <PageHero
        eyebrow="Galería del alojamiento"
        title={`Conocé ${content.name}`}
        description="Este espacio reúne únicamente fotografías reales publicadas por el hostel."
        aside="Fotos reales"
      />
      <section className="section page-section">
        <div className="shell">
          {gallery.length ? (
            <div className="public-gallery-grid" aria-label="Fotografías publicadas">
              {gallery.map((asset) => (
                <figure className="public-gallery-card" key={asset.id}>
                  <Image
                    src={asset.publicUrl}
                    alt={asset.altText}
                    width={asset.width}
                    height={asset.height}
                    sizes="(max-width: 620px) 92vw, (max-width: 1024px) 46vw, 31vw"
                  />
                  {asset.caption ? <figcaption>{asset.caption}</figcaption> : (
                    <figcaption className="sr-only">
                      {MEDIA_CATEGORY_LABELS[asset.category]}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          ) : (
            <div className="public-gallery-empty">
              <p className="eyebrow">Galería en preparación</p>
              <h2>Las fotografías reales estarán disponibles próximamente.</h2>
              <p>Mientras tanto, podés pedir imágenes actuales por WhatsApp o visitar nuestro Instagram.</p>
            </div>
          )}

          <div className="gallery-contact">
            <div>
              <p className="eyebrow">Imágenes actuales</p>
              <h2>¿Querés ver los espacios antes de reservar?</h2>
              <p>Consultanos y te compartimos información actual del alojamiento.</p>
            </div>
            <div className="button-row">
              <a className="button button--primary" href={contactHref} target="_blank" rel="noreferrer">
                Pedir fotos por WhatsApp
              </a>
              <a className="button button--ghost" href={socialConfig.instagramUrl} target="_blank" rel="noreferrer">
                Ver Instagram
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
