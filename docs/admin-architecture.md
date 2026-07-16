# Panel operativo

## Límites de ejecución

La experiencia pública sigue separada de `/admin`. El panel conserva su shell,
componentes, rutas y estilos. `APP_MODE` selecciona el backend:

- `demo`: datos ficticios de `demo-data.ts`, mutaciones puras en memoria y aviso
  visual permanente;
- `production`: Supabase Auth, snapshot PostgreSQL real y mutaciones server-side.

No existe fallback automático de producción a demo. Una configuración incompleta
falla de forma explícita antes de exponer un panel engañoso.

## Flujo productivo

1. `app/admin/layout.tsx` valida variables y exige una sesión de empleado activa.
2. `SupabaseOperationsRepository` carga el snapshot inicial respetando RLS.
3. El proveedor de UI mantiene la misma API para todos los componentes.
4. Cada mutación se envía a `/api/admin/operations`.
5. El servidor valida origen, sesión y payload Zod.
6. El repositorio invoca RPC transaccionales o escrituras protegidas por RLS.
7. PostgreSQL registra historia y auditoría; luego se devuelve un snapshot nuevo.

## Seguridad

- La publicable key identifica el proyecto, pero los datos se autorizan con la
  sesión del usuario y RLS.
- La Secret key/service role solo puede importarse desde un módulo `server-only`.
- Los roles iniciales son `owner`, `admin`, `reception`, `housekeeping` y
  `maintenance`.
- Limpieza y mantenimiento no reciben permisos de huéspedes, reservas ni pagos.
- Los usuarios nuevos quedan `pending` y sin rol.
- Los RPC aplican permisos, rate limit, locks, reglas de capacidad, pagos y
  disponibilidad antes de escribir.
- La ruta de mutación agrega control de mismo origen para sesiones en cookies.

## Integridad operacional

- Los saldos se derivan de `agreed_total` y movimientos de `payments`; no se
  guardan acumuladores editables.
- Un exclusion constraint y un lock por habitación evitan carreras entre reservas.
- Un trigger cruza asignaciones con bloqueos para impedir doble ocupación.
- Check-out con saldo pendiente se rechaza.
- Check-out crea una tarea de limpieza y pasa la habitación a pendiente.
- Los timestamps se almacenan con zona y la fecha hotelera usa Buenos Aires.
