import type { Metadata } from "next";
import { FaqList } from "@/app/components/faq-list";
import { PageHero } from "@/app/components/page-hero";
import { getPublicSiteContent } from "@/app/lib/public-site-content";

export const metadata: Metadata = {
  title: "Preguntas frecuentes",
  alternates: { canonical: "/preguntas-frecuentes" },
};

export default async function FaqPage() {
  const content = await getPublicSiteContent();
  return (
    <main>
      <PageHero
        eyebrow="Información útil"
        title="Todo claro antes de llegar"
        description={`Respuestas basadas únicamente en información confirmada por ${content.name}.`}
        aside="Actualizado"
      />
      <section className="section page-section">
        <div className="shell narrow-shell"><FaqList content={content} /></div>
      </section>
    </main>
  );
}
