import type { Metadata } from "next";
import { PageHero } from "@/app/components/page-hero";
import { confirmedAmenities } from "@/app/lib/site";

export const metadata: Metadata = {
  title: "Servicios",
  alternates: { canonical: "/servicios" },
};

export default function ServicesPage() {
  return (
    <main>
      <PageHero
        eyebrow="Servicios confirmados"
        title="Todo lo necesario para una estadía simple"
        description="Comodidades pensadas para descansar, conectarte y disfrutar los espacios compartidos."
        aside="Desayuno incluido"
      />
      <section className="section page-section">
        <div className="shell">
          <div className="amenities-grid amenities-grid--page">
            {confirmedAmenities.map((amenity, index) => (
              <article className="amenity-card amenity-card--large" key={amenity.title}>
                <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <h2>{amenity.title}</h2>
                <p>{amenity.description}</p>
              </article>
            ))}
          </div>
          <div className="two-column-note">
            <div><span>Sin estacionamiento</span><p>El hostel no posee estacionamiento propio.</p></div>
            <div><span>Baños compartidos</span><p>Las habitaciones privadas no tienen baño privado.</p></div>
          </div>
        </div>
      </section>
    </main>
  );
}
