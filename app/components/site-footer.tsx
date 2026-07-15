import Link from "next/link";
import {
  generalWhatsappHref,
  navigation,
  siteConfig,
} from "@/app/lib/site";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer__grid">
        <div className="site-footer__brand">
          <Link className="wordmark wordmark--footer" href="/">
            <span className="wordmark__seal" aria-hidden="true">HB</span>
            <span><strong>Hostel Bauti</strong><small>Alojamiento en Ezeiza</small></span>
          </Link>
          <p>
            Una estadía simple, cálida y cercana en Ezeiza, con habitaciones
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
            <a href={generalWhatsappHref} target="_blank" rel="noreferrer">
              WhatsApp {siteConfig.whatsappDisplay}
            </a>
            <a href={siteConfig.instagramUrl} target="_blank" rel="noreferrer">
              Instagram {siteConfig.instagramHandle}
            </a>
            <Link href="/ubicacion">{siteConfig.address}</Link>
          </div>
        </div>
      </div>

      <div className="shell site-footer__bottom">
        <p>© {new Date().getFullYear()} Hostel Bauti</p>
        <nav aria-label="Información legal">
          <Link href="/politicas">Políticas</Link>
          <Link href="/privacidad">Privacidad</Link>
          <Link href="/terminos">Términos</Link>
        </nav>
      </div>
    </footer>
  );
}
