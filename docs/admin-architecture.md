# Panel operativo

## Auditoría previa

Antes de esta etapa no existían rutas administrativas, dashboard, componentes
internos ni lógica de operación. La web pública estaba completa y se mantuvo sin
cambios visuales. El esquema Drizzle/D1 continúa vacío para no crear una segunda
fuente de verdad incompatible con la futura decisión de Supabase/PostgreSQL.

## Estructura implementada

- `app/admin/layout.tsx`: límite protegido del panel y layout independiente.
- `app/admin/components`: shell responsive, proveedor del estado operativo y UI.
- `app/admin/lib/types.ts`: contratos de habitaciones, huéspedes, reservas,
  pagos, notas, incidencias y auditoría.
- `app/admin/lib/operations.ts`: reglas y transiciones puras del dominio.
- `app/admin/lib/demo-data.ts`: único lugar con datos ficticios, identificados
  mediante nombres y códigos `DEMO`.
- Rutas separadas para dashboard, habitaciones, huéspedes actuales, reservas,
  walk-in, check-in, check-out, pagos y notas.

## Flujos funcionales

- Walk-in: valida habitación y capacidad, crea huésped y reserva, registra pago
  inicial, hace check-in, ocupa la habitación y crea auditoría.
- Reserva manual: copia la tarifa aplicada, calcula total y saldo, registra el
  origen y reserva la habitación.
- Check-in: valida el estado de reserva y habitación, registra hora real, aloja
  al huésped y ocupa la habitación.
- Check-out: obliga a revisar saldos, registra hora real y envía la habitación a
  pendiente de limpieza.
- Pago: impide importes negativos o superiores al saldo y actualiza el estado
  financiero de la reserva.
- Habitación: permite recorrer el ciclo pendiente de limpieza, en limpieza,
  limpia y lista.

## Límite del modo demo

El estado se mantiene únicamente mientras no se recargue la aplicación. Es una
simulación funcional para probar la operación, no una fuente de verdad. No usa
`localStorage` ni almacena datos personales reales. El panel publicado exige
autenticación; la identidad del entorno no sustituye el RBAC definitivo.

## Conexión productiva posterior

Las funciones de `operations.ts` definen las invariantes que deberán ejecutarse
en transacciones del servidor. PostgreSQL deberá impedir solapamientos mediante
rangos semiabiertos `[check_in, check_out)`, aplicar RLS, registrar auditoría y
autorizar cada operación en servidor. Los formularios y vistas actuales podrán
conectarse a Server Actions o Route Handlers sin rediseñar la interfaz.
