# Arquitectura

## Auditoría del punto de partida

El repositorio partió de un starter `vinext` sin funcionalidades del hostel:

- Next.js 16 App Router y React 19 ejecutados inicialmente por Vinext/Vite.
- Un Worker de Cloudflare servía la aplicación y optimizaba imágenes.
- Tailwind CSS disponible, más una capa visual propia en `app/globals.css`.
- Drizzle configurado para SQLite/D1, pero sin tablas ni migraciones.
- D1 y R2 estaban desactivados.
- Sin Supabase, autenticación, reservas, administración ni datos de negocio.
- Una única página placeholder y tests que exigían conservar ese placeholder.

La aplicación actual ejecuta Next.js de forma nativa y queda preparada para el
runtime Node.js de Vercel. Los componentes exclusivos de Vinext, Vite y
Cloudflare se retiraron sin cambiar la capa de negocio ni Supabase.

## Decisión de arquitectura

Se conserva el frontend existente porque es App Router real, el código público
ya es portable y reemplazarlo no aporta valor. La web pública vive en el grupo
de rutas `app/(public)` para que los futuros layouts de `/admin`, `/staff` y
`/mi-cuenta` sean independientes.

Para la capa de negocio se recomienda:

1. Supabase PostgreSQL como fuente de verdad.
2. Supabase Auth para identidad.
3. Supabase Storage para imágenes y comprobantes.
4. Migraciones SQL versionadas como contrato de datos.
5. RLS y funciones PostgreSQL para permisos y operaciones críticas.
6. Route Handlers/Server Actions como límite de aplicación.
7. Servicios de dominio puros para disponibilidad, precios y estados.

No se mantiene D1/SQLite en paralelo: Supabase es la única fuente de verdad.

Drizzle podría conectarse a PostgreSQL, pero en este proyecto añadiría una capa
adicional sobre Supabase Auth, Storage, RLS y RPC sin una ventaja inmediata. La
propuesta es usar tipos generados por Supabase y SQL explícito para constraints,
políticas y transacciones críticas. Esta decisión puede revisarse si el equipo
necesita un ORM para consultas complejas del backend.

## Runtime y despliegue

El proyecto produce un build estándar en `.next/` y usa el runtime Node.js de
Next.js para Server Components, Route Handlers, cookies y optimización de
imágenes. Vercel es el destino de hosting previsto; la publicación y sus
variables se configuran en una tarea separada.

## Capas

- `app/(public)`: sitio, SEO y consultas públicas.
- `app/(auth)`: login, registro y recuperación (Fase 4).
- `app/(customer)`: cuenta y reservas propias (Fase 7).
- `app/admin`: operación y configuración (Fase 5).
- `app/staff`: operación móvil simplificada (Fase 6).
- `app/components`: UI reutilizable y accesible.
- `app/lib`: configuración, validación, permisos y dominio.
- `supabase/migrations`: esquema, funciones, RLS y datos iniciales.
- `tests`: dominio, seguridad y renderizado.

## Reglas críticas

- Fechas de estadía como intervalo semiabierto `[check_in, check_out)`.
- Las operaciones de confirmación se resuelven dentro de PostgreSQL.
- Los precios aplicados se copian a la reserva; nunca se recalculan desde reglas
  futuras.
- RLS protege filas; ocultar botones no constituye autorización.
- Service role solo en procesos confiables y nunca en el navegador.
- Todos los cambios financieros, de permisos y de disponibilidad se auditan.
