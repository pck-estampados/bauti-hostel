import type { Metadata } from "next";
import { PageHero } from "@/app/components/page-hero";
import { generalWhatsappHref, siteConfig } from "@/app/lib/site";

export const metadata: Metadata = { title: "Contacto" };

export default function ContactPage() {
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
          <a className="contact-card contact-card--primary" href={generalWhatsappHref} target="_blank" rel="noreferrer">
            <span>WhatsApp</span><strong>{siteConfig.whatsappDisplay}</strong><p>Reservas y consultas</p><i aria-hidden="true">→</i>
          </a>
          <a className="contact-card" href={siteConfig.instagramUrl} target="_blank" rel="noreferrer">
            <span>Instagram</span><strong>{siteConfig.instagramHandle}</strong><p>Novedades y contacto</p><i aria-hidden="true">→</i>
          </a>
          <div className="contact-card">
            <span>Dirección</span><strong>Uruguayana 235</strong><p>Ezeiza, Provincia de Buenos Aires</p>
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
