# Modelo de datos propuesto

## Identidad y permisos

- `profiles`: extensión 1:1 de `auth.users`, datos básicos y estado.
- `roles`: roles configurables (`owner`, `admin`, `reception`, `housekeeping`,
  `maintenance`, `customer`).
- `permissions`: acciones atómicas por recurso.
- `role_permissions`: permisos asignados a cada rol.
- `user_roles`: roles por establecimiento y usuario.

## Inventario

- `properties`: permite escalar a más de un establecimiento sin duplicar el
  modelo; inicialmente contiene Hostel Bauti.
- `room_types`: descripción pública y reglas generales.
- `rooms`: unidad física reservable, código interno, estado y publicación.
- `beds`: configuración versionable de camas por habitación.
- `amenities` y `room_amenities`: catálogo y relación con habitaciones.
- `media` y `room_media`: archivos, textos alternativos, portada y orden.
- `room_status_history`: historial operativo.
- `availability_blocks`: bloqueos manuales, mantenimiento y cierre comercial.

## Personas y estadías

- `guests`: datos mínimos del huésped, con información sensible separable.
- `reservations`: cabecera, fechas, totales, estado, origen y snapshots de
  tarifa.
- `reservation_rooms`: habitación asignada y rango ocupado; permite futuras
  reservas con varias habitaciones.
- `reservation_guests`: acompañantes y titularidad.
- `reservation_status_history`: transición, responsable y motivo.
- `pre_checkins`: datos previos a llegada y consentimiento.

## Comercial

- `rate_plans`: tarifa base y condiciones generales.
- `pricing_rules`: temporada, día, ocupación, anticipación y estadía mínima.
- `promotions` y `promotion_rooms`: alcance y vigencia.
- `promo_codes` y `promo_redemptions`: códigos y control de uso.
- `payments`: movimientos, moneda, medio, estado y referencia.
- `payment_files`: comprobantes en Storage.
- `inquiries`: leads y motivo de pérdida.

## Operación

- `housekeeping_tasks`: estado, asignación, inicio, fin y notas.
- `maintenance_issues`: zona o habitación, categoría, prioridad y bloqueo.
- `staff_notes`: observaciones internas con visibilidad controlada.
- `messages`: registro de comunicaciones.
- `notifications`: email, WhatsApp o notificación interna.

## Contenido y control

- `site_settings`: contacto, horarios, tarifa de referencia y flags.
- `pages`, `faq`, `testimonials`: CMS; testimonios solo se publican tras revisión.
- `audit_logs`: actor, acción, recurso, valores previos/nuevos, IP y fecha.

## Constraints e índices esenciales

- `check_out > check_in`.
- Cantidades y montos no negativos.
- Moneda ISO; inicialmente `ARS`.
- Códigos de reserva y habitación únicos por establecimiento.
- Índices en fechas, estados, habitación, huésped y origen.
- Un exclusion constraint PostgreSQL impide solapamientos activos por
  habitación usando `daterange(check_in, check_out, '[)')`.
- Estados cancelados, rechazados y no-show se excluyen del constraint mediante
  una condición parcial.
- Los bloqueos se validan en la misma función transaccional que confirma la
  reserva para evitar condiciones de carrera.

## RLS inicial

- Público: solo contenido e inventario publicados.
- Cliente: únicamente su perfil, huéspedes autorizados y reservas propias.
- Limpieza: tareas asignadas y datos mínimos de habitación; sin finanzas.
- Mantenimiento: incidencias asignadas y ubicación; sin datos de huéspedes.
- Recepción: reservas, huéspedes y pagos según permiso.
- Propietario/administrador: acceso definido por rol y establecimiento.
- Auditoría: inserción mediante funciones seguras; lectura restringida.
