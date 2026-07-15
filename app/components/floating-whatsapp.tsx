import { generalWhatsappHref } from "@/app/lib/site";

export function FloatingWhatsApp() {
  return (
    <a
      className="floating-whatsapp"
      href={generalWhatsappHref}
      target="_blank"
      rel="noreferrer"
      aria-label="Consultar alojamiento por WhatsApp"
    >
      <span aria-hidden="true">WA</span>
      <strong>WhatsApp</strong>
    </a>
  );
}
