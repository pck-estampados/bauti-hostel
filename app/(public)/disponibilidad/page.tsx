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
import { getPublicSiteContent } from "@/app/lib/public-site-content";
import { generalWhatsappMessage, whatsappHref } from "@/app/lib/site";
import { publicLodgingAvailability } from "@/app/lib/lodging-server";
import { LodgingResults } from "@/app/components/lodging-results";

export const metadata: Metadata = {
  title: "Consultar disponibilidad",
  alternates: { canonical: "/disponibilidad" },
};

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<AvailabilitySearchParams>;
}) {
  const request = parseAvailabilityRequest(await searchParams);
  const content = await getPublicSiteContent();
  const datesAreValid = isValidAvailabilityRequest(request);
  const totalGuests = request.adults + request.children;
  const lodgingRequest = { checkIn: request.checkin, checkOut: request.checkout, adults: request.adults, children: request.children };
  const lodging = datesAreValid ? await publicLodgingAvailability(lodgingRequest) : null;
  const message = datesAreValid
    ? buildAvailabilityWhatsappMessage(request, content.name)
    : generalWhatsappMessage(content.name);

  return (
    <main>
      <PageHero
        eyebrow="Disponibilidad"
        title="Consultá tu estadía"
        description="Consultá categorías y tarifas para tus fechas. También podés comunicarte por WhatsApp; una consulta o hold temporal no confirma una reserva."
        aside="Alojamiento por categoría"
      />
      <section className="section page-section availability-page">
        <div className="shell availability-result-grid">
          <div className="booking-panel">
            <h2>Revisá tu búsqueda</h2>
            <AvailabilityForm defaults={{
              name: request.name,
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
                  {request.name ? <div><dt>Nombre</dt><dd>{request.name}</dd></div> : null}
                  <div><dt>Adultos</dt><dd>{request.adults}</dd></div>
                  <div><dt>Niños</dt><dd>{request.children}</dd></div>
                  <div><dt>Total</dt><dd>{totalGuests}</dd></div>
                </dl>
                <p>{content.whatsapp ? "WhatsApp se abrirá con todos los datos ingresados. La disponibilidad y la tarifa se confirman en la conversación." : "El canal de WhatsApp está pendiente de configuración. Esta consulta no se envió ni confirma una reserva."}</p>
                <a className="button button--primary button--full" href={whatsappHref(content.whatsapp, message)} target="_blank" rel="noreferrer">
                  {content.whatsapp ? "Consultar disponibilidad por WhatsApp" : "Ver canales de contacto"}
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
      {lodging && <LodgingResults request={lodgingRequest} categories={lodging.categories} ready={lodging.ready} />}
    </main>
  );
}
