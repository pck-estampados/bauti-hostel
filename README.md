# Hostel Bauti

Plataforma web y operativa de Hostel Bauti, en Ezeiza. Incluye la experiencia
pública aprobada y el panel privado de administración.

## Requisitos

- Node.js 22.13 o posterior.
- npm.

## Desarrollo local

```bash
npm install
npm run dev
```

La aplicación queda disponible en `http://localhost:3000`. El script de inicio
es multiplataforma y configura Wrangler desde Node.

## Comandos

```bash
npm run dev       # servidor local
npm run build     # build de producción con vinext
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
- La base D1/Drizzle del starter permanece sin enlazar y no es fuente de verdad.

La integración Supabase está preparada y pendiente de credenciales, aplicación
de migraciones y verificación contra el proyecto real. Esta fase incompleta no
se desplegó.

Los cambios dentro de `APP_MODE=demo` se descartan al recargar. No debe usarse
para datos reales. Consultar `docs/supabase-setup.md` antes de activar
`APP_MODE=production`.

La arquitectura, la auditoría, el modelo de datos y el roadmap están documentados
en `docs/`.
