import Link from "next/link";
import type { PublicRoom } from "@/app/lib/site";

export function RoomCard({ room, index }: { room: PublicRoom; index: number }) {
  return (
    <article className="room-card">
      <div className={`room-card__visual room-card__visual--${room.tone}`}>
        <span className="room-card__number">0{index + 1}</span>
        <span className="room-card__monogram" aria-hidden="true">HB</span>
      </div>
      <div className="room-card__body">
        <p className="eyebrow">Habitación privada</p>
        <h3>{room.name}</h3>
        <p>{room.description}</p>
        <dl className="room-card__facts">
          <div><dt>Capacidad</dt><dd>{room.capacityLabel}</dd></div>
          <div><dt>Camas</dt><dd>{room.bedsLabel}</dd></div>
        </dl>
        <Link className="text-link" href={`/habitaciones/${room.slug}`}>
          Ver habitación <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
