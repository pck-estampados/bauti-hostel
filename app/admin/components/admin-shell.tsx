"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useOperations } from "./operations-provider";

const navigation = [
  { href: "/admin", label: "Resumen", code: "HO" },
  { href: "/admin/habitaciones", label: "Habitaciones ahora", code: "HA" },
  { href: "/admin/huespedes/actuales", label: "Huéspedes alojados", code: "HU" },
  { href: "/admin/reservas", label: "Reservas", code: "RE" },
  { href: "/admin/pagos/pendientes", label: "Pagos y saldos", code: "PA" },
  { href: "/admin/notas", label: "Notas internas", code: "NO" },
];

function AdminNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className={mobile ? "admin-mobile-nav" : "admin-nav"} aria-label="Navegación de administración">
      {navigation.map((item) => {
        const current = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link href={item.href} key={item.href} aria-current={current ? "page" : undefined}>
            <span aria-hidden="true">{item.code}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminShell({ children, userName }: { children: ReactNode; userName: string }) {
  const { resetDemo } = useOperations();
  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/admin" aria-label="Hostel Bauti, administración">
          <span>HB</span>
          <strong>Hostel Bauti<small>Administración</small></strong>
        </Link>
        <AdminNavigation />
        <div className="admin-sidebar__bottom">
          <Link href="/" target="_blank">Ver sitio público ↗</Link>
          <button type="button" onClick={resetDemo}>Restablecer datos demo</button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <details className="admin-mobile-menu">
            <summary aria-label="Abrir navegación administrativa"><span /><span /></summary>
            <AdminNavigation mobile />
          </details>
          <div className="admin-topbar__context">
            <span className="admin-live-dot" aria-hidden="true" />
            Operación diaria
          </div>
          <div className="admin-user">
            <span>{userName.slice(0, 1).toUpperCase()}</span>
            <div><strong>{userName}</strong><small>Recepción · demo</small></div>
          </div>
        </header>

        <div className="admin-demo-banner" role="status">
          <strong>Entorno de prueba</strong>
          <span>Todos los huéspedes, habitaciones, importes y operaciones del panel son ficticios. Los cambios se descartan al recargar.</span>
        </div>

        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
