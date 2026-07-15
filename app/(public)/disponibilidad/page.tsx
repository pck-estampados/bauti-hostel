import type { Metadata } from "next";
import Link from "next/link";
import { AvailabilityForm } from "@/app/components/availability-form";
import { PageHero } from "@/app/components/page-hero";
import {
  buildAvailabilityWhatsappMessage,
  displayDate,
  isValidAvailabilityRequest,
  parseAvailabilityRequest,
  type AvailabilitySearchParams,
} from "@/app/lib/availability";
import { whatsappHref } from "@/app/lib/site";

export const metadata: Metadata = {
  title: "Consultar disponibilidad",
  description:
    "Consultá disponibilidad y tarifas de Hostel Bauti por WhatsApp según tus fechas y cantidad de huéspedes.",
};

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<AvailabilitySearchParams>;
}) {
  const request = parseAvailabilityRequest(await searchParams);
  const datesAreValid = isValidAvailabilityRequest(request);
  const totalGuests = request.adults + request.children;
  const message = datesAreValid
    ? buildAvailabilityWhatsappMessage(request)
    : "Hola, quisiera consultar por alojamiento y disponibilidad en Hostel Bauti.";

  return (
    <main>
      <PageHero
        eyebrow="Disponibilidad"
        title="Consultá tu estadía"
        description="Revisá tus fechas y envianos la consulta por WhatsApp. Te responderemos con las habitaciones disponibles y la tarifa total."
        aside="Respuesta por WhatsApp"
      />
      <section className="section page-section availability-page">
        <div className="shell availability-result-grid">
          <div className="booking-panel">
            <h2>Revisá tu búsqueda</h2>
            <AvailabilityForm defaults={{
              checkin: request.checkin,
              checkout: request.checkout,
              adults: String(request.adults),
              children: String(request.children),
            }} />
          </div>
          <aside className="availability-result">
            {datesAreValid ? (
              <>
                <span className="status-badge status-badge--pending">Consulta lista</span>
                <h2>{displayDate(request.checkin)} <small>al</small> {displayDate(request.checkout)}</h2>
                <dl>
                  <div><dt>Adultos</dt><dd>{request.adults}</dd></div>
                  <div><dt>Niños</dt><dd>{request.children}</dd></div>
                  <div><dt>Total</dt><dd>{totalGuests}</dd></div>
                </dl>
                <p>WhatsApp se abrirá con todos los datos ingresados. La disponibilidad y la tarifa se confirman en la conversación.</p>
                <a className="button button--primary button--full" href={whatsappHref(message)} target="_blank" rel="noreferrer">
                  Consultar disponibilidad por WhatsApp
                </a>
              </>
            ) : (
              <>
                <span className="status-badge status-badge--neutral">Fechas requeridas</span>
                <h2>Elegí fechas válidas</h2>
                <p>La salida debe ser posterior al ingreso. Completá el formulario para preparar tu consulta.</p>
                <Link className="text-link" href="/contacto">Ver otros canales de contacto <span aria-hidden="true">→</span></Link>
              </>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
