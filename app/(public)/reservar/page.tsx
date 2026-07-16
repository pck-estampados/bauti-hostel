import type { Metadata } from "next";
import { AvailabilityForm } from "@/app/components/availability-form";
import { PageHero } from "@/app/components/page-hero";
import { getPublicSiteContent } from "@/app/lib/public-site-content";
import { generalWhatsappMessage, whatsappHref } from "@/app/lib/site";

export const metadata: Metadata = {
  title: "Consultar estadía",
  alternates: { canonical: "/reservar" },
};

export default async function BookingStartPage() {
  const content = await getPublicSiteContent();
  const contactHref = whatsappHref(
    content.whatsapp,
    generalWhatsappMessage(content.name),
  );
  return (
    <main>
      <PageHero
        eyebrow="Consulta de estadía"
        title="Contanos cuándo querés venir"
        description="Elegí tus fechas y envianos la consulta por WhatsApp. Te responderemos si existe una opción y con qué tarifa."
        aside="Consulta sin cargo"
      />
      <section className="section page-section booking-page">
        <div className="shell booking-page__grid">
          <div className="booking-panel">
            <div className="booking-panel__heading">
              <span>01</span>
              <div><strong>Fechas y huéspedes</strong><p>Completá los datos para preparar tu consulta.</p></div>
            </div>
            <AvailabilityForm />
          </div>
          <aside className="booking-help">
            <p className="eyebrow">¿Preferís hablar con nosotros?</p>
            <h2>Atención directa por WhatsApp</h2>
            <p>Escribinos con tus fechas y cantidad de huéspedes. Te responderemos con las opciones disponibles.</p>
            <a className="button button--dark" href={contactHref} target="_blank" rel="noreferrer">Abrir WhatsApp</a>
            <ul>
              <li>La consulta no genera un cobro.</li>
              <li>La disponibilidad se confirma por WhatsApp.</li>
              <li>La tarifa final depende de la habitación y las fechas.</li>
            </ul>
          </aside>
        </div>
      </section>
    </main>
  );
}
