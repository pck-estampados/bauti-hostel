import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/app/components/page-hero";
import { getPublicSiteContent } from "@/app/lib/public-site-content";
import { checkInLabel } from "@/app/lib/core-settings";

export const metadata: Metadata = {
  title: "Información del alojamiento",
  alternates: { canonical: "/politicas" },
  description: "Horarios y políticas públicas confirmadas del alojamiento.",
};

export default async function PoliciesPage() {
  const content = await getPublicSiteContent();
  const confirmedRules = [
    ["Check-in", `${checkInLabel(content)} hs.`],
    ["Check-out", `Hasta las ${content.checkOutUntil} hs.`],
    ["Cortesía de salida", `Hasta las ${content.courtesyCheckoutUntil} hs., exclusivamente con autorización operativa. No es automática.`],
    ["Desayuno", `De ${content.breakfastFrom} a ${content.breakfastUntil} hs.`],
    [
      "Horario de descanso",
      `De ${content.quietHoursFrom} a ${content.quietHoursUntil} hs. ${content.policies.quietHours}`,
    ],
    ["Reservas y cancelaciones", content.policies.cancellation || "Condiciones pendientes de confirmar. Consultanos antes de reservar."],
    ["Menores", content.policies.minors],
    ["Mascotas", content.policies.pets],
    ["Fumar", content.policies.smoking],
  ] as const;
  return (
    <main>
      <PageHero
        eyebrow="Antes de tu estadía"
        title={`Información de ${content.name}`}
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
          {content.policies.residentPetsDisclosure ? <p>{content.policies.residentPetsDisclosure}</p> : null}
          <strong>¿Necesitás confirmar una condición antes de reservar?</strong>
          <p>Consultanos directamente para recibir información aplicable a tu estadía.</p>
          <Link className="text-link" href="/contacto">Ir a contacto <span aria-hidden="true">→</span></Link>
        </div>
      </section>
    </main>
  );
}
