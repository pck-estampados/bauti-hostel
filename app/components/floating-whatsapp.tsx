import { generalWhatsappMessage, whatsappHref } from "@/app/lib/site";
import type { PublicSiteContent } from "@/app/lib/public-site-types";

export function FloatingWhatsApp({ content }: { content: PublicSiteContent }) {
  return (
    <a
      className="floating-whatsapp"
      href={whatsappHref(content.whatsapp, generalWhatsappMessage(content.name))}
      target="_blank"
      rel="noreferrer"
      aria-label="Consultar alojamiento por WhatsApp"
    >
      <span aria-hidden="true">WA</span>
      <strong>WhatsApp</strong>
    </a>
  );
}
