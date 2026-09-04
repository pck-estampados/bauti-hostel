# Casa Albor

Plataforma web y operativa de Casa Albor, en Ezeiza. Incluye la experiencia
pública aprobada y el panel privado de administración.

## Requisitos

- Node.js 22 LTS (declarado en `.nvmrc` y `package.json`).
- npm.
- Docker Desktop con motor Linux, exclusivamente para Supabase local.

## Desarrollo local

```powershell
npm ci
npm run db:local -- start
npm run app:local -- dev
```

La aplicación queda disponible en `http://127.0.0.1:3000` y utiliza Next.js nativo.
El launcher exige el stack aislado `casa-albor-bootstrap`, inyecta sus variables
en memoria y no modifica `.env.local`. No usar el comando directo de desarrollo
si `.env.local` apunta a producción. El flag `APP_MODE=production` selecciona el
adaptador real de Supabase LOCAL; no implica desplegar ni conectarse al remoto.

## Comandos

```powershell
npm run app:local -- build # npm run build, con Supabase local
npm run app:local -- test  # npm test, con Supabase local
npm run db:local -- replay # reset local + 15 migraciones + pruebas + limpieza
npm run lint      # análisis estático
npm run typecheck
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

El Handoff Maestro V1.27 es la fuente funcional. La configuración canónica,
contradicciones y decisiones T1 están en `docs/T1-core-model-security-report.md`.
Staging se difiere por decisión de proyecto hasta antes de T9: sin Supabase Pro,
proyectos/branches remotos ni Vercel en T1. T1–T8 no autorizan cambios productivos.
LOCAL COMPLETE no significa PRODUCTION VALIDATED. Las migraciones versionadas
son inmutables; toda evolución es una migración nueva.

`room_types` implementa categorías: venta futura por categoría, asignación física
por `rooms`. El estado de reserva es distinto del financiero. La proyección
`reservation_lifecycle` mantiene compatibilidad legacy; importes derivados del
ledger. T2 agrega tarifas nocturnas, disponibilidad y holds reales. T3 completará
la conversión atómica a reserva y la transición de escritores sin duplicar saldos.

Tarifas: `/admin/tarifas`; disponibilidad y holds: `/admin/calendario` y
`/disponibilidad`. No hay tarifas, categorías ni habitaciones creadas como seed.
Domingo ordinario y condiciones/fechas de promociones requieren configuración.
Detalles, seguridad, pruebas y contrato de conversión T3:
[`docs/T2-lodging-rates-availability-report.md`](docs/T2-lodging-rates-availability-report.md).

Roles: owner/admin = Gerencia; housekeeping = Limpieza (proyección mínima);
bar = Barra preparado, sin permisos; reception futuro; maintenance sin ampliar.
Auth actual corresponde exclusivamente al personal, no a huéspedes/clientes.

La arquitectura, la auditoría, el modelo de datos y el roadmap están documentados
en `docs/`.
