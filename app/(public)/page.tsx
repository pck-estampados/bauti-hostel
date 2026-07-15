import Link from "next/link";
import { AccommodationInquiry } from "@/app/components/accommodation-inquiry";
import { AvailabilityForm } from "@/app/components/availability-form";
import { FaqList } from "@/app/components/faq-list";
import { RoomCard } from "@/app/components/room-card";
import { SectionHeading } from "@/app/components/section-heading";
import {
  confirmedAmenities,
  confirmedSpaces,
  generalWhatsappHref,
  mapsHref,
  mapsEmbedHref,
  publishedRooms,
  siteConfig,
} from "@/app/lib/site";

const lodgingBusinessJsonLd = {
  "@context": "https://schema.org",
  "@type": "Hostel",
  name: siteConfig.name,
  address: {
    "@type": "PostalAddress",
    streetAddress: "Uruguayana 235",
    addressLocality: "Ezeiza",
    addressRegion: "Provincia de Buenos Aires",
    addressCountry: "AR",
  },
  telephone: siteConfig.whatsappDisplay,
  sameAs: [siteConfig.instagramUrl],
  amenityFeature: confirmedAmenities.map((amenity) => ({
    "@type": "LocationFeatureSpecification",
    name: amenity.title,
    value: true,
  })),
};

export default function HomePage() {
  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(lodgingBusinessJsonLd) }}
      />

      <section className="hero">
        <div className="shell hero__grid">
          <div className="hero__content">
            <p className="eyebrow">Ezeiza · Provincia de Buenos Aires</p>
            <h1>Descansá cerca.<br /><em>Sentite en casa.</em></h1>
            <p className="hero__lead">
              Habitaciones privadas, desayuno incluido y espacios para bajar el
              ritmo. Una estadía cálida y simple, con atención cercana.
            </p>
            <div className="button-row">
              <Link className="button button--primary" href="/reservar">Reservar ahora</Link>
              <a className="button button--ghost" href={generalWhatsappHref} target="_blank" rel="noreferrer">
                Consultar por WhatsApp
              </a>
            </div>
            <div className="hero__trust" aria-label="Servicios principales">
              <span>Desayuno incluido</span>
              <span>WiFi</span>
              <span>Patio &amp; pileta</span>
            </div>
          </div>

          <div className="hero-art" aria-label="Composición gráfica de Hostel Bauti">
            <div className="hero-art__sun" />
            <div className="hero-art__arch">
              <span>HB</span>
              <p>Hostel Bauti</p>
              <small>Ezeiza · Argentina</small>
            </div>
            <div className="hero-art__caption">
              <span>Uruguayana 235</span>
              <strong>Ezeiza · Buenos Aires</strong>
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
              Hostel Bauti combina la privacidad de tu habitación con el clima
              relajado de los espacios compartidos. Estamos en Ezeiza y queremos
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
            <AccommodationInquiry />
          )}
        </div>
      </section>

      <section className="section amenities-section">
        <div className="shell">
          <SectionHeading
            eyebrow="Incluido en tu estadía"
            title="Lo esencial, bien resuelto"
            description="Servicios confirmados actualmente por Hostel Bauti."
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
              description="Habitaciones privadas, pileta, patio y espacios comunes forman parte de la propuesta confirmada de Hostel Bauti."
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
              src={mapsEmbedHref}
              title="Mapa de Hostel Bauti en Uruguayana 235, Ezeiza"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <div className="location-copy">
            <p className="eyebrow">Dónde estamos</p>
            <h2>Tu descanso en Ezeiza</h2>
            <p className="location-address">Uruguayana 235<br />Ezeiza, Provincia de Buenos Aires</p>
            <p>
              Consultanos por WhatsApp antes de viajar y te ayudamos a organizar tu llegada.
            </p>
            <a className="button button--dark" href={mapsHref} target="_blank" rel="noreferrer">Cómo llegar</a>
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
          <FaqList limit={6} />
        </div>
      </section>

      <section className="final-cta">
        <div className="shell final-cta__inner">
          <div>
            <p className="eyebrow">Hostel Bauti · Ezeiza</p>
            <h2>¿Ya tenés tus fechas?</h2>
            <p>Consultá disponibilidad y recibí atención directa.</p>
          </div>
          <div className="button-row">
            <Link className="button button--light" href="/reservar">Reservar</Link>
            <a className="button button--outline-light" href={generalWhatsappHref} target="_blank" rel="noreferrer">WhatsApp</a>
          </div>
        </div>
      </section>
    </main>
  );
}
