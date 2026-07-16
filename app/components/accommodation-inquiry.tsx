import Link from "next/link";
import { formatArs } from "@/app/lib/site";
import type { PublicSiteContent } from "@/app/lib/public-site-types";

export function AccommodationInquiry({
  compact = false,
  content,
}: {
  compact?: boolean;
  content: PublicSiteContent;
}) {
  return (
    <article className={`accommodation-inquiry${compact ? " accommodation-inquiry--compact" : ""}`}>
      <div className="accommodation-inquiry__visual" aria-hidden="true">
        <span>HB</span>
        <strong>Habitaciones privadas</strong>
        <small>{content.name} · {content.city}</small>
      </div>
      <div className="accommodation-inquiry__body">
        <p className="eyebrow">Alojamiento</p>
        <h3>Consultá si hay una opción para tu estadía</h3>
        <p>
          Contamos con habitaciones privadas y baños compartidos. Escribinos con
          tus fechas y cantidad de huéspedes para saber si existe una opción.
        </p>
        <div className="accommodation-inquiry__facts">
          <span>Desayuno incluido</span>
          <span>WiFi</span>
          <span>Pileta y patio</span>
        </div>
        <div className="accommodation-inquiry__footer">
          <p>
            <small>Tarifa de referencia</small>
            <strong>Desde {formatArs(content.basePriceArs)} por habitación/noche</strong>
            <span>El valor final depende de la habitación y las fechas.</span>
          </p>
          <Link className="button button--primary" href="/reservar">
            Consultar disponibilidad
          </Link>
        </div>
      </div>
    </article>
  );
}
