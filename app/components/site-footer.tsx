import Image from "next/image";
import Link from "next/link";
import { brand, footerNavigation } from "@/app/lib/brand";
import {
  generalWhatsappMessage,
  publicFullAddress,
  whatsappHref,
} from "@/app/lib/site";
import type { PublicSiteContent } from "@/app/lib/public-site-types";

export function SiteFooter({ content }: { content: PublicSiteContent }) {
  const contactHref = whatsappHref(
    content.whatsapp,
    generalWhatsappMessage(content.name),
  );
  return (
    <footer className="site-footer">
      <div className="shell site-footer__grid">
        <div className="site-footer__brand">
          <Link className="site-footer__logo" href="/" aria-label={`${brand.publicName}, inicio`}>
            <Image
              src={brand.assets.logoCream}
              alt={brand.publicName}
              width={1000}
              height={1000}
              sizes="180px"
            />
          </Link>
          <p className="site-footer__descriptor">{content.descriptor}</p>
          <p>Una estadía cálida y cercana en {content.city}, con habitaciones privadas y espacios para compartir.</p>
        </div>

        <div>
          <p className="footer-title">Explorá</p>
          <nav className="footer-links" aria-label="Navegación del pie">
            {footerNavigation.map((item) => (
              <Link key={item.href} href={item.href}>{item.label}</Link>
            ))}
          </nav>
        </div>

        <div>
          <p className="footer-title">Contacto</p>
          <div className="footer-links">
            <a href={contactHref} target="_blank" rel="noreferrer">
              {content.whatsapp ? `WhatsApp ${content.whatsapp}` : "Consultar canales de contacto"}
            </a>
            <a href={brand.instagram.url} target="_blank" rel="noreferrer">
              Instagram
            </a>
            <Link href="/ubicacion">{publicFullAddress(content)}</Link>
          </div>
        </div>
      </div>

      <div className="shell site-footer__bottom">
        <p>© {new Date().getFullYear()} {brand.publicName}</p>
        <nav aria-label="Información legal">
          <Link href="/politicas">Políticas</Link>
          <Link href="/privacidad">Privacidad</Link>
          <Link href="/terminos">Términos</Link>
        </nav>
      </div>
    </footer>
  );
}
