import Link from "next/link";
import { formatArs, siteConfig } from "@/app/lib/site";

export function AccommodationInquiry({ compact = false }: { compact?: boolean }) {
  return (
    <article className={`accommodation-inquiry${compact ? " accommodation-inquiry--compact" : ""}`}>
      <div className="accommodation-inquiry__visual" aria-hidden="true">
        <span>HB</span>
        <strong>Habitaciones privadas</strong>
        <small>Hostel Bauti · Ezeiza</small>
      </div>
      <div className="accommodation-inquiry__body">
        <p className="eyebrow">Alojamiento</p>
        <h3>Consultá la opción disponible para tu estadía</h3>
        <p>
          Contamos con habitaciones privadas y baños compartidos. Escribinos con
          tus fechas y cantidad de huéspedes para conocer las opciones disponibles.
        </p>
        <div className="accommodation-inquiry__facts">
          <span>Desayuno incluido</span>
          <span>WiFi</span>
          <span>Pileta y patio</span>
        </div>
        <div className="accommodation-inquiry__footer">
          <p>
            <small>Tarifa de referencia</small>
            <strong>Desde {formatArs(siteConfig.initialBasePriceArs)} por noche</strong>
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
