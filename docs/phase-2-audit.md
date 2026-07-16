# Auditoría de inicio de Fase 2

## Hallazgos

- El sitio público y el panel tienen rutas y componentes separados; no fue
  necesario rediseñar la experiencia aprobada.
- El panel usaba un único estado React inicializado desde `demo-data.ts`. Toda
  operación se perdía al recargar.
- No existía `localStorage` ni persistencia accidental de datos personales.
- La protección publicada dependía de la identidad externa del hosting, sin
  usuarios, roles ni permisos propios de la aplicación.
- El starter conservaba archivos vacíos de D1/Drizzle, pero D1 no estaba enlazado
  ni configurado como fuente de verdad.
- El inventario real no existía y los cuatro cuartos presentes eran claramente
  ficticios y estaban concentrados en `demo-data.ts`.

## Decisiones implementadas

- PostgreSQL administrado por Supabase como única fuente de verdad productiva.
- Supabase Auth con sesiones SSR en cookies y sin registro público de empleados.
- RBAC propio respaldado por RLS; los permisos no dependen de metadata editable
  por el usuario.
- Adaptadores `DemoOperationsRepository` y `SupabaseOperationsRepository` bajo
  un contrato común.
- Todas las mutaciones productivas cruzan una ruta servidor validada; la UI no
  recibe ni conoce claves privadas.
- Operaciones críticas como RPC transaccionales, con locks, límites de frecuencia,
  control de solapamiento, historial y auditoría.
- Rango de estadía semiabierto y fecha hotelera en
  `America/Argentina/Buenos_Aires`.
- Demo habilitado solo por `APP_MODE=demo`; producción exige variables completas,
  sesión activa y rol.

## Riesgo pendiente antes de activar producción

Las migraciones todavía no se ejecutaron contra un proyecto real. Falta validar
el SQL, RLS, concurrencia y recuperación de sesión dentro de Supabase. Por esa
razón no corresponde desplegar ni cargar datos reales hasta completar
`docs/supabase-setup.md`.
