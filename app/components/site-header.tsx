import Link from "next/link";
import { navigation } from "@/app/lib/site";
import type { PublicSiteContent } from "@/app/lib/public-site-types";

export function SiteHeader({ content }: { content: PublicSiteContent }) {
  return (
    <header className="site-header">
      <div className="shell site-header__inner">
        <Link className="wordmark" href="/" aria-label={`${content.name}, inicio`}>
          <span className="wordmark__seal" aria-hidden="true">HB</span>
          <span>
            <strong>{content.name}</strong>
            <small>{content.city} · {content.province}</small>
          </span>
        </Link>

        <nav className="desktop-nav" aria-label="Navegación principal">
          {navigation.slice(0, 6).map((item) => (
            <Link key={item.href} href={item.href}>{item.label}</Link>
          ))}
        </nav>

        <Link className="button button--small button--dark header-booking" href="/reservar">
          Consultar estadía
        </Link>

        <details className="mobile-menu">
          <summary aria-label="Abrir navegación">
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </summary>
          <nav aria-label="Navegación móvil">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href}>{item.label}</Link>
            ))}
            <Link className="button button--primary" href="/reservar">Consultar estadía</Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
