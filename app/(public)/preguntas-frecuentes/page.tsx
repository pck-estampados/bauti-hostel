import type { Metadata } from "next";
import { FaqList } from "@/app/components/faq-list";
import { PageHero } from "@/app/components/page-hero";

export const metadata: Metadata = { title: "Preguntas frecuentes" };

export default function FaqPage() {
  return (
    <main>
      <PageHero
        eyebrow="Información útil"
        title="Todo claro antes de llegar"
        description="Respuestas basadas únicamente en información confirmada por Hostel Bauti."
        aside="Actualizado"
      />
      <section className="section page-section">
        <div className="shell narrow-shell"><FaqList /></div>
      </section>
    </main>
  );
}
