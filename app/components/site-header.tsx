import Image from "next/image";
import Link from "next/link";
import { brand, primaryNavigation } from "@/app/lib/brand";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="shell site-header__inner">
        <Link className="brand-lockup" href="/" aria-label={`${brand.publicName}, inicio`}>
          <span className="brand-lockup__isotipo-frame" aria-hidden="true">
            <Image
              className="brand-lockup__isotipo"
              src={brand.assets.isotipo}
              alt=""
              width={1000}
              height={1000}
              priority
            />
          </span>
          <span className="brand-lockup__copy">
            <strong>{brand.publicName}</strong>
            <small>{brand.descriptor}</small>
          </span>
        </Link>

        <nav className="desktop-nav" aria-label="Navegación principal">
          {primaryNavigation.map((item) => (
            <Link key={item.href} href={item.href}>{item.label}</Link>
          ))}
        </nav>

        <Link className="button button--small button--dark header-booking" href="/reservar">
          Reservar
        </Link>

        <details className="mobile-menu">
          <summary>
            <span className="mobile-menu__lines" aria-hidden="true">
              <i />
              <i />
            </span>
            <span className="sr-only">Abrir navegación principal</span>
          </summary>
          <nav aria-label="Navegación móvil">
            {primaryNavigation.map((item) => (
              <Link key={item.href} href={item.href}>{item.label}</Link>
            ))}
            <Link className="button button--primary" href="/reservar">Reservar</Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
