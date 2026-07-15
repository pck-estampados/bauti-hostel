# Arquitectura propuesta

## Auditoría del punto de partida

El repositorio recibido era el starter `vinext` sin funcionalidades del hostel:

- Next.js 16 App Router y React 19 ejecutados por vinext/Vite.
- Worker de Cloudflare para servir la aplicación y optimizar imágenes.
- Tailwind CSS disponible, más una capa visual propia en `app/globals.css`.
- Drizzle configurado para SQLite/D1, pero sin tablas ni migraciones.
- D1 y R2 desactivados en `.openai/hosting.json`.
- Sin Supabase, autenticación, reservas, administración ni datos de negocio.
- Una única página placeholder y tests que exigían conservar ese placeholder.

El proceso detenido registrado en `.devserver.stderr.log` falló con `EACCES` al
intentar obtener `Request.cf` dentro del sandbox. No era un error de React. La
ejecución manual posterior estaba activa y respondía correctamente.

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

No se recomienda mantener D1/SQLite en paralelo. El starter todavía contiene
los adaptadores vacíos porque no afectan la Fase 1; deben retirarse cuando se
incorpore el cliente Supabase, evitando dos fuentes de verdad.

Drizzle podría conectarse a PostgreSQL, pero en este proyecto añadiría una capa
adicional sobre Supabase Auth, Storage, RLS y RPC sin una ventaja inmediata. La
propuesta es usar tipos generados por Supabase y SQL explícito para constraints,
políticas y transacciones críticas. Esta decisión puede revisarse si el equipo
necesita un ORM para consultas complejas del backend.

## Límite de despliegue pendiente

El starter actual produce un Cloudflare Worker. El brief original menciona
Vercel. Todo el código de interfaz usa APIs compatibles con Next.js, por lo que
la decisión de hosting puede tomarse antes de producción sin rehacer la Fase 1.
No se deben sostener ambos runtimes en producción. Supabase funciona con ambos.

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
