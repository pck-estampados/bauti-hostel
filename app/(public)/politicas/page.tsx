import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/app/components/page-hero";

export const metadata: Metadata = {
  title: "Información del alojamiento",
  description: "Horarios e información confirmada para hospedarse en Hostel Bauti.",
};

const confirmedRules = [
  ["Check-out", "Hasta las 10:00 hs."],
  ["Check-in", "Desde la mañana, sujeto a disponibilidad y coordinación previa."],
  ["Pileta", "Disponible para huéspedes."],
  ["Fumar", "Únicamente en espacios exteriores, como la entrada o el patio."],
  ["Estacionamiento", "El establecimiento no posee estacionamiento."],
  ["Baños", "Las habitaciones no tienen baño privado; los baños son compartidos."],
] as const;

export default function PoliciesPage() {
  return (
    <main>
      <PageHero
        eyebrow="Antes de tu estadía"
        title="Información de Hostel Bauti"
        description="Horarios y características importantes para organizar tu llegada y estadía."
        aside="Información confirmada"
      />
      <section className="section page-section">
        <div className="shell policy-grid">
          {confirmedRules.map(([title, description], index) => (
            <article className="policy-card" key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h2>{title}</h2>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <div className="shell legal-notice">
          <strong>¿Necesitás confirmar una condición antes de reservar?</strong>
          <p>Consultanos directamente para recibir información aplicable a tu estadía.</p>
          <Link className="text-link" href="/contacto">Ir a contacto <span aria-hidden="true">→</span></Link>
        </div>
      </section>
    </main>
  );
}
