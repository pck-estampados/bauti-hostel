import Link from "next/link";
import {
  generalWhatsappMessage,
  navigation,
  publicFullAddress,
  socialConfig,
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
          <Link className="wordmark wordmark--footer" href="/">
            <span className="wordmark__seal" aria-hidden="true">HB</span>
            <span><strong>{content.name}</strong><small>Alojamiento en {content.city}</small></span>
          </Link>
          <p>
            Una estadía simple, cálida y cercana en {content.city}, con habitaciones
            privadas y espacios para compartir.
          </p>
        </div>

        <div>
          <p className="footer-title">Explorá</p>
          <nav className="footer-links" aria-label="Navegación del pie">
            {navigation.slice(1).map((item) => (
              <Link key={item.href} href={item.href}>{item.label}</Link>
            ))}
          </nav>
        </div>

        <div>
          <p className="footer-title">Contacto</p>
          <div className="footer-links">
            <a href={contactHref} target="_blank" rel="noreferrer">
              WhatsApp {content.whatsapp}
            </a>
            <a href={socialConfig.instagramUrl} target="_blank" rel="noreferrer">
              Instagram {socialConfig.instagramHandle}
            </a>
            <Link href="/ubicacion">{publicFullAddress(content)}</Link>
          </div>
        </div>
      </div>

      <div className="shell site-footer__bottom">
        <p>© {new Date().getFullYear()} {content.name}</p>
        <nav aria-label="Información legal">
          <Link href="/politicas">Políticas</Link>
          <Link href="/privacidad">Privacidad</Link>
          <Link href="/terminos">Términos</Link>
        </nav>
      </div>
    </footer>
  );
}
