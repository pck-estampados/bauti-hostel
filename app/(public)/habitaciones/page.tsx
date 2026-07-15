import type { Metadata } from "next";
import { AccommodationInquiry } from "@/app/components/accommodation-inquiry";
import { PageHero } from "@/app/components/page-hero";
import { RoomCard } from "@/app/components/room-card";
import { publishedRooms } from "@/app/lib/site";

export const metadata: Metadata = {
  title: "Habitaciones privadas",
  description:
    "Consultá habitaciones privadas disponibles en Hostel Bauti, Ezeiza. Desayuno incluido, WiFi, patio y pileta para huéspedes.",
};

export default function RoomsPage() {
  return (
    <main>
      <PageHero
        eyebrow="Alojamiento en Ezeiza"
        title="Habitaciones privadas para tu estadía"
        description="Consultá las opciones disponibles según tus fechas y cantidad de huéspedes. La tarifa final se confirma para cada estadía."
        aside="Baños compartidos"
      />
      <section className="section page-section">
        <div className="shell">
          {publishedRooms.length > 0 ? (
            <div className="room-grid">
              {publishedRooms.map((room, index) => (
                <RoomCard key={room.slug} room={room} index={index} />
              ))}
            </div>
          ) : (
            <AccommodationInquiry />
          )}

          <div className="two-column-note room-truths">
            <div>
              <span>Habitaciones privadas</span>
              <p>El espacio de descanso es de uso privado.</p>
            </div>
            <div>
              <span>Baños compartidos</span>
              <p>Las habitaciones no tienen baño privado.</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
