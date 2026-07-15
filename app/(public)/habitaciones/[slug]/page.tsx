import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { publishedRooms, whatsappHref } from "@/app/lib/site";

type RoomDetailProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return publishedRooms.map((room) => ({ slug: room.slug }));
}

export async function generateMetadata({ params }: RoomDetailProps): Promise<Metadata> {
  const { slug } = await params;
  const room = publishedRooms.find((item) => item.slug === slug);
  return room
    ? { title: room.name, description: room.description }
    : { title: "Habitación" };
}

export default async function RoomDetailPage({ params }: RoomDetailProps) {
  const { slug } = await params;
  const room = publishedRooms.find((item) => item.slug === slug);
  if (!room) notFound();

  const message = `Hola, quiero consultar disponibilidad y tarifa para ${room.name} en Hostel Bauti.`;

  return (
    <main>
      <section className="room-detail-hero">
        <div className="shell room-detail-hero__grid">
          <div>
            <p className="eyebrow">Habitación privada</p>
            <h1>{room.name}</h1>
            <p>{room.description}</p>
            <div className="button-row">
              <a className="button button--primary" href={whatsappHref(message)} target="_blank" rel="noreferrer">
                Consultar disponibilidad
              </a>
              <Link className="button button--ghost" href="/habitaciones">Ver habitaciones</Link>
            </div>
          </div>
          <div className={`room-detail-visual room-detail-visual--${room.tone}`} aria-hidden="true">
            <span>HB</span><strong>{room.name}</strong>
          </div>
        </div>
      </section>
      <section className="section page-section">
        <div className="shell detail-grid">
          <article className="content-card">
            <p className="eyebrow">Características</p>
            <h2>Información de la habitación</h2>
            <dl className="detail-list">
              <div><dt>Capacidad</dt><dd>{room.capacityLabel}</dd></div>
              <div><dt>Camas</dt><dd>{room.bedsLabel}</dd></div>
              <div><dt>Baño</dt><dd>Compartido</dd></div>
            </dl>
          </article>
          <aside className="sticky-note">
            <span>Tarifa</span>
            <strong>{room.priceLabel}</strong>
            <p>El precio final se confirma según las fechas y condiciones de la estadía.</p>
          </aside>
        </div>
      </section>
    </main>
  );
}
