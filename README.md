# Hostel Bauti

Plataforma web y operativa de Hostel Bauti, en Ezeiza. Incluye la experiencia
pública aprobada y el panel privado de administración.

## Requisitos

- Node.js 22 LTS (declarado en `.nvmrc` y `package.json`).
- npm.

## Desarrollo local

```bash
npm install
npm run dev
```

La aplicación queda disponible en `http://localhost:3000` y utiliza el runtime
nativo de Next.js.

## Comandos

```bash
npm run dev       # servidor local
npm run build     # build de producción nativo de Next.js
npm test          # build y pruebas de renderizado/seguridad estructural
npm run lint      # análisis estático
```

## Estado actual

- Sitio público responsive, rutas comerciales y legales, metadata, sitemap y robots.
- Panel operativo responsive en `/admin` con backend demo o Supabase seleccionable.
- Habitaciones, huéspedes, reservas, walk-in, check-in, check-out, pagos, saldos,
  limpieza y notas internas.
- Transiciones funcionales en memoria para demo y RPC PostgreSQL atómicas para producción.
- Supabase Auth SSR, RBAC, RLS, validación Zod, control de origen, rate limit y auditoría.
- Migraciones versionadas para el modelo operacional; no contienen habitaciones,
  camas, huéspedes, reservas ni pagos ficticios.
- Adaptadores separados para demo y Supabase bajo un contrato común.
- Supabase PostgreSQL, Auth y Storage son la única fuente de verdad persistente.

Las credenciales públicas y el modo de aplicación se configuran únicamente por
variables de entorno; no se versionan secretos ni archivos `.env.local`.

Los cambios dentro de `APP_MODE=demo` se descartan al recargar. No debe usarse
para datos reales. Consultar `docs/supabase-setup.md` antes de activar
`APP_MODE=production`.

La arquitectura, la auditoría, el modelo de datos y el roadmap están documentados
en `docs/`.
