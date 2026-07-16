import type { Metadata } from "next";
import { PageHero } from "@/app/components/page-hero";
import { getPublicSiteContent } from "@/app/lib/public-site-content";

export const metadata: Metadata = {
  title: "Términos de uso",
  alternates: { canonical: "/terminos" },
};

export default async function TermsPage() {
  const content = await getPublicSiteContent();
  return (
    <main>
      <PageHero
        eyebrow="Términos"
        title="Uso de la web y consultas"
        description="Alcance de la información y del proceso de consulta disponible actualmente."
        aside="Información vigente"
      />
      <section className="section legal-page">
        <div className="shell narrow-shell prose-card">
          <h2>Información del alojamiento</h2>
          <p>La web presenta información confirmada de {content.name} y permite consultar disponibilidad mediante WhatsApp.</p>
          <h2>Consultas y reservas</h2>
          <p>Enviar una consulta no confirma una reserva, no bloquea una habitación y no genera un cobro. La reserva se confirma directamente con {content.name}.</p>
          <h2>Tarifas</h2>
          <p>La tarifa publicada es una referencia inicial. El valor final depende de la habitación disponible, las fechas y las condiciones informadas al responder la consulta.</p>
        </div>
      </section>
    </main>
  );
}
