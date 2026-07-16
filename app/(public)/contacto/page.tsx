import type { Metadata } from "next";
import { PageHero } from "@/app/components/page-hero";
import { getPublicSiteContent } from "@/app/lib/public-site-content";
import {
  generalWhatsappMessage,
  socialConfig,
  whatsappHref,
} from "@/app/lib/site";

export const metadata: Metadata = {
  title: "Contacto",
  alternates: { canonical: "/contacto" },
};

export default async function ContactPage() {
  const content = await getPublicSiteContent();
  const contactHref = whatsappHref(
    content.whatsapp,
    generalWhatsappMessage(content.name),
  );
  return (
    <main>
      <PageHero
        eyebrow="Hablemos"
        title="Estamos para ayudarte a organizar tu estadía"
        description="Consultá fechas, llegada o información general por nuestros canales oficiales."
        aside="Respuesta directa"
      />
      <section className="section page-section">
        <div className="shell contact-grid">
          <a className="contact-card contact-card--primary" href={contactHref} target="_blank" rel="noreferrer">
            <span>WhatsApp</span><strong>{content.whatsapp}</strong><p>Reservas y consultas</p><i aria-hidden="true">→</i>
          </a>
          <a className="contact-card" href={socialConfig.instagramUrl} target="_blank" rel="noreferrer">
            <span>Instagram</span><strong>{socialConfig.instagramHandle}</strong><p>Novedades y contacto</p><i aria-hidden="true">→</i>
          </a>
          <div className="contact-card">
            <span>Dirección</span><strong>{content.address}</strong><p>{content.city}, Provincia de {content.province}</p>
          </div>
        </div>
        <div className="shell response-note">
          <strong>Para cotizar tu estadía</strong>
          <p>Tené a mano fecha de ingreso, fecha de salida y cantidad de huéspedes. La disponibilidad y el precio se confirman por cada consulta.</p>
        </div>
      </section>
    </main>
  );
}
