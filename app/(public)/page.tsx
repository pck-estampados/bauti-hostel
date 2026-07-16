import type { Metadata } from "next";
import Link from "next/link";
import { AccommodationInquiry } from "@/app/components/accommodation-inquiry";
import { AvailabilityForm } from "@/app/components/availability-form";
import { FaqList } from "@/app/components/faq-list";
import { RoomCard } from "@/app/components/room-card";
import { SectionHeading } from "@/app/components/section-heading";
import {
  confirmedAmenities,
  confirmedSpaces,
  generalWhatsappMessage,
  mapsHref,
  mapsEmbedHref,
  publicFullAddress,
  publishedRooms,
  whatsappHref,
} from "@/app/lib/site";
import { getPublicSiteContent } from "@/app/lib/public-site-content";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function HomePage() {
  const content = await getPublicSiteContent();
  const fullAddress = publicFullAddress(content);
  const contactHref = whatsappHref(
    content.whatsapp,
    generalWhatsappMessage(content.name),
  );
  const lodgingBusinessJsonLd = {
    "@context": "https://schema.org",
    "@type": "Hostel",
    name: content.name,
    address: {
      "@type": "PostalAddress",
      streetAddress: content.address,
      addressLocality: content.city,
      addressRegion: content.province,
      addressCountry: "AR",
    },
    telephone: content.phone,
    priceRange: `Desde ARS ${content.basePriceArs.toLocaleString("es-AR")} por habitación/noche`,
    checkinTime: content.checkInFrom,
    checkoutTime: content.checkOutUntil,
  };
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(lodgingBusinessJsonLd) }}
      />

      <section className="hero">
        <div className="shell hero__grid">
          <div className="hero__content">
            <p className="eyebrow">{content.city} · Provincia de {content.province}</p>
            <h1>Descansá cerca.<br /><em>Sentite en casa.</em></h1>
            <p className="hero__lead">
              Habitaciones privadas, desayuno incluido y espacios para bajar el
              ritmo. Una estadía cálida y simple, con atención cercana.
            </p>
            <div className="button-row">
              <Link className="button button--primary" href="/reservar">Consultar estadía</Link>
              <a className="button button--ghost" href={contactHref} target="_blank" rel="noreferrer">
                Consultar por WhatsApp
              </a>
            </div>
            <div className="hero__trust" aria-label="Servicios principales">
              <span>Desayuno incluido</span>
              <span>WiFi</span>
              <span>Patio &amp; pileta</span>
            </div>
          </div>

          <div className="hero-art" aria-label={`Composición gráfica de ${content.name}`}>
            <div className="hero-art__sun" />
            <div className="hero-art__arch">
              <span>HB</span>
              <p>{content.name}</p>
              <small>{content.city} · Argentina</small>
            </div>
            <div className="hero-art__caption">
              <span>{content.address}</span>
              <strong>{content.city} · {content.province}</strong>
            </div>
          </div>
        </div>

        <div className="shell booking-bar-wrap">
          <div className="booking-bar__intro">
            <span>Tu próxima estadía</span>
            <strong>Consultá tus fechas</strong>
          </div>
          <AvailabilityForm compact />
        </div>
      </section>

      <section className="section intro-section">
        <div className="shell intro-grid">
          <div>
            <p className="eyebrow">Hospitalidad sin vueltas</p>
            <h2 className="display-title">Un lugar tranquilo para llegar, descansar y seguir.</h2>
          </div>
          <div className="intro-copy">
            <p>
              {content.name} combina la privacidad de tu habitación con el clima
              relajado de los espacios compartidos. Estamos en {content.city} y queremos
              que te sientas acompañado desde la primera consulta.
            </p>
            <Link className="text-link" href="/servicios">Conocé los servicios <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>

      <section className="section rooms-section">
        <div className="shell">
          <div className="section-topline">
            <SectionHeading
              eyebrow="Habitaciones"
              title="Tu espacio para descansar"
              description="Habitaciones privadas con desayuno incluido, WiFi y acceso a los espacios comunes del alojamiento."
            />
            <Link className="text-link section-topline__link" href="/habitaciones">
              Conocer el alojamiento <span aria-hidden="true">→</span>
            </Link>
          </div>
          {publishedRooms.length > 0 ? (
            <div className="room-grid">
              {publishedRooms.map((room, index) => (
                <RoomCard key={room.slug} room={room} index={index} />
              ))}
            </div>
          ) : (
            <AccommodationInquiry content={content} />
          )}
        </div>
      </section>

      <section className="section amenities-section">
        <div className="shell">
          <SectionHeading
            eyebrow="Incluido en tu estadía"
            title="Lo esencial, bien resuelto"
            description={`Servicios confirmados actualmente por ${content.name}.`}
          />
          <div className="amenities-grid">
            {confirmedAmenities.map((amenity) => (
              <article className="amenity-card" key={amenity.title}>
                <span aria-hidden="true">{amenity.code}</span>
                <h3>{amenity.title}</h3>
                <p>{amenity.description}</p>
              </article>
            ))}
          </div>
          <div className="important-info">
            <p><strong>Información importante</strong></p>
            <p>Las habitaciones no tienen baño privado.</p>
            <p>El establecimiento no posee estacionamiento.</p>
          </div>
        </div>
      </section>

      <section className="section gallery-section">
        <div className="shell">
          <div className="section-topline">
            <SectionHeading
              eyebrow="Galería"
              title="Espacios para disfrutar tu estadía"
              description={`Habitaciones privadas, pileta, patio y espacios comunes forman parte de la propuesta confirmada de ${content.name}.`}
            />
            <Link className="text-link section-topline__link" href="/galeria">Ver espacios <span aria-hidden="true">→</span></Link>
          </div>
          <div className="space-grid">
            {confirmedSpaces.map((space) => (
              <article className={`space-card space-card--${space.tone}`} key={space.title}>
                <span>{space.code}</span>
                <div><h3>{space.title}</h3><p>{space.description}</p></div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section location-section">
        <div className="shell location-grid">
          <div className="map-embed">
            <iframe
              src={mapsEmbedHref(fullAddress)}
              title={`Mapa de ${content.name} en ${content.address}, ${content.city}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <div className="location-copy">
            <p className="eyebrow">Dónde estamos</p>
            <h2>Tu descanso en {content.city}</h2>
            <p className="location-address">{content.address}<br />{content.city}, Provincia de {content.province}</p>
            <p>
              Consultanos por WhatsApp antes de viajar y te ayudamos a organizar tu llegada.
            </p>
            <a className="button button--dark" href={mapsHref(fullAddress)} target="_blank" rel="noreferrer">Cómo llegar</a>
          </div>
        </div>
      </section>

      <section className="section faq-section">
        <div className="shell faq-grid">
          <div>
            <SectionHeading
              eyebrow="Antes de venir"
              title="Preguntas frecuentes"
              description="Información clara para que puedas planificar tu estadía."
            />
            <Link className="text-link" href="/preguntas-frecuentes">Ver todas las respuestas <span aria-hidden="true">→</span></Link>
          </div>
          <FaqList content={content} limit={6} />
        </div>
      </section>

      <section className="final-cta">
        <div className="shell final-cta__inner">
          <div>
            <p className="eyebrow">{content.name} · {content.city}</p>
            <h2>¿Ya tenés tus fechas?</h2>
            <p>Consultá disponibilidad y recibí atención directa.</p>
          </div>
          <div className="button-row">
            <Link className="button button--light" href="/reservar">Consultar estadía</Link>
            <a className="button button--outline-light" href={contactHref} target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
        </div>
      </section>
    </main>
  );
}
