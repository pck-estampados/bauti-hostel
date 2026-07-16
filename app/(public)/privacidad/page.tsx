import type { Metadata } from "next";
import { PageHero } from "@/app/components/page-hero";
import { getPublicSiteContent } from "@/app/lib/public-site-content";
import { generalWhatsappMessage, whatsappHref } from "@/app/lib/site";

export const metadata: Metadata = {
  title: "Privacidad",
  alternates: { canonical: "/privacidad" },
};

export default async function PrivacyPage() {
  const content = await getPublicSiteContent();
  const contactHref = whatsappHref(
    content.whatsapp,
    generalWhatsappMessage(content.name),
  );
  return (
    <main>
      <PageHero
        eyebrow="Privacidad"
        title="Cómo funciona esta web"
        description="Información clara sobre la consulta de disponibilidad y los servicios externos utilizados."
        aside="Versión pública"
      />
      <section className="section legal-page">
        <div className="shell narrow-shell prose-card">
          <h2>Consultas de disponibilidad</h2>
          <p>El formulario prepara un mensaje con las fechas y cantidad de huéspedes que elegís. La información se envía únicamente cuando decidís abrir y enviar el mensaje mediante WhatsApp.</p>
          <h2>Cuentas y pagos</h2>
          <p>Esta versión de la web no crea cuentas de usuario, no solicita documentos personales y no procesa pagos en línea.</p>
          <h2>Servicios externos</h2>
          <p>Los enlaces a WhatsApp, Instagram y Google Maps abren servicios de terceros, sujetos a sus propias condiciones y políticas de privacidad.</p>
          <p className="muted-note">Para realizar una consulta sobre el uso de esta web, podés <a className="text-link" href={contactHref} target="_blank" rel="noreferrer">contactar a {content.name}</a>.</p>
        </div>
      </section>
    </main>
  );
}
