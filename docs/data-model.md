# Modelo de datos de Fase 2

## Identidad y autorización

- `profiles`: extensión 1:1 de `auth.users`, con estado `pending`, `active` o
  `disabled`.
- `roles`, `permissions`, `role_permissions`, `user_roles`: RBAC propio; ningún
  permiso se toma de metadata editable por el usuario.
- Roles iniciales: propietario, administrador, recepción, limpieza y mantenimiento.

## Inventario

- `room_types`, `rooms`, `beds`: inventario confirmado y estado operativo.
- `availability_blocks`: cierres por mantenimiento u operación.
- `room_status_history`: trazabilidad de cada cambio de estado.

Las tablas de inventario nacen vacías. Los roles y permisos son configuración
del sistema, no contenido ficticio.

## Personas y estadías

- `guests`: datos mínimos del huésped, con baja lógica e índices normalizados.
- `reservations`: cabecera, fechas, origen, tarifa aplicada y total acordado.
- `reservation_guests`: titular y acompañantes.
- `room_assignments`: habitación y rango ocupado.
- `reservation_status_history`: cambios de estado con actor y motivo.

## Finanzas

- `payments`: movimientos inmutables de cobro o devolución, con posibilidad de
  anulación auditada.
- `reservation_financials`: vista `security_invoker` que deriva pagado y saldo.

No existen columnas editables `paid` o `balance` en reservas. El saldo siempre
se recalcula desde el total acordado y los movimientos vigentes.

## Operación y control

- `housekeeping_tasks`: tareas y ciclo de limpieza.
- `maintenance_issues`: incidencias, prioridad, asignación y bloqueo de inventario.
- `internal_notes`: notas internas con alcance controlado.
- `activity_logs`: eventos legibles por operación.
- `audit_logs`: valores anteriores y posteriores de cambios sensibles.
- `settings`: configuración tipada como JSON, pública solo cuando se marca así.

## Integridad y concurrencia

- `check_out > check_in`, capacidades positivas y montos no negativos.
- Moneda ISO; inicialmente `ARS`.
- Códigos de reserva y habitación únicos.
- Rango PostgreSQL semiabierto `[check_in, check_out)`.
- Exclusion constraint GiST por habitación para asignaciones y bloqueos.
- Advisory lock transaccional por habitación para serializar la validación entre
  ambas tablas y evitar carreras.
- Walk-in, reserva, check-in, check-out, pago y cambio operativo como RPC con
  permisos y rate limit.
- Fecha hotelera calculada en `America/Argentina/Buenos_Aires`; timestamps en
  `timestamptz`.

## RLS

- `anon`: no accede a datos operativos; solo puede leer settings expresamente
  públicos.
- recepción: habitaciones, huéspedes, reservas, pagos y notas.
- limpieza: habitaciones y tareas de limpieza, sin datos personales ni finanzas.
- mantenimiento: ubicaciones e incidencias, sin huéspedes ni pagos.
- administración: operación y personal según permiso.
- propietario: control total y lectura de auditoría.

Todas las tablas sensibles tienen RLS. Las funciones auxiliares con
`security definer` viven en el esquema no expuesto `private`.
