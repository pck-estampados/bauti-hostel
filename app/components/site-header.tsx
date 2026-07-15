import Link from "next/link";
import { navigation } from "@/app/lib/site";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell site-header__inner">
        <Link className="wordmark" href="/" aria-label="Hostel Bauti, inicio">
          <span className="wordmark__seal" aria-hidden="true">HB</span>
          <span>
            <strong>Hostel Bauti</strong>
            <small>Ezeiza · Buenos Aires</small>
          </span>
        </Link>

        <nav className="desktop-nav" aria-label="Navegación principal">
          {navigation.slice(0, 6).map((item) => (
            <Link key={item.href} href={item.href}>{item.label}</Link>
          ))}
        </nav>

        <Link className="button button--small button--dark header-booking" href="/reservar">
          Reservar
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
            <Link className="button button--primary" href="/reservar">Reservar</Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
