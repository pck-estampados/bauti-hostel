"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useOperations } from "./operations-provider";
import { ROLE_LABELS } from "@/app/lib/core-settings";
import { brand } from "@/app/lib/brand";

const navigation = [
  { href: "/admin", label: "Resumen", code: "HO" },
  { href: "/admin/limpieza", label: "Limpieza", code: "LI" },
  { href: "/admin/operacion", label: "Operación", code: "OP" },
  { href: "/admin/experiencias", label: "Experiencias", code: "EX" },
  { href: "/admin/habitaciones", label: "Habitaciones", code: "HA" },
  { href: "/admin/huespedes/actuales", label: "Huéspedes alojados", code: "HU" },
  { href: "/admin/reservas", label: "Reservas", code: "RE" },
  { href: "/admin/calendario", label: "Calendario", code: "CA" },
  { href: "/admin/caja", label: "Caja", code: "CJ" },
  { href: "/admin/notas", label: "Notas internas", code: "NO" },
  { href: "/admin/galeria", label: "Galería", code: "GA" },
  { href: "/admin/configuracion", label: "Configuración", code: "CO" },
];

function AdminNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const { permissions, mode } = useOperations();
  const required: Record<string, string> = {
    "/admin/limpieza": "housekeeping.read", "/admin/operacion": "reservations.read",
    "/admin/experiencias": "experiences.read", "/admin/habitaciones": "rooms.read",
    "/admin/huespedes/actuales": "guests.read", "/admin/reservas": "reservations.read",
    "/admin/calendario": "reservations.read", "/admin/caja": "payments.read",
    "/admin/notas": "notes.read", "/admin/galeria": "media.read", "/admin/configuracion": "settings.read",
  };
  return (
    <nav className={mobile ? "admin-mobile-nav" : "admin-nav"} aria-label="Navegación de administración">
      {navigation.filter((item) => mode === "demo" || !required[item.href] || permissions.includes(required[item.href])).map((item) => {
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

export function AdminShell({
  children,
  userName,
  mode,
  userRoles = [],
}: {
  children: ReactNode;
  userName: string;
  mode: "demo" | "production";
  userRoles?: string[];
}) {
  const { resetDemo } = useOperations();
  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
        <Link className="admin-brand" href="/admin" aria-label={`${brand.publicName}, administración`}>
          <Image className="admin-brand__mark" src={brand.assets.isotipoCream} alt="" width={52} height={52} />
          <strong>{brand.publicName}<small>Administración</small></strong>
        </Link>
        <AdminNavigation />
        <div className="admin-sidebar__bottom">
          <Link href="/" target="_blank">Ver sitio público ↗</Link>
          {mode === "demo" ? (
            <button type="button" onClick={resetDemo}>Restablecer datos demo</button>
          ) : (
            <form action="/auth/signout" method="post"><button type="submit">Cerrar sesión</button></form>
          )}
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
            <div><strong>{userName}</strong><small>{mode === "demo" ? "Recepción · demo" : userRoles.map((role) => ROLE_LABELS[role] ?? role).join(", ") || "Equipo interno"}</small></div>
          </div>
        </header>

        {mode === "demo" ? (
          <div className="admin-demo-banner" role="status">
            <strong>Entorno de prueba</strong>
            <span>Todos los huéspedes, habitaciones, importes y operaciones del panel son ficticios. Los cambios se descartan al recargar.</span>
          </div>
        ) : null}

        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
