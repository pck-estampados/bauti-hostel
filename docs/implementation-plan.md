# Plan de implementación

## Fase 1 — experiencia pública

Home pública real, alojamiento sin inventario no confirmado, consulta dinámica
por WhatsApp, servicios, espacios confirmados, mapa, ubicación, FAQ, contacto,
páginas informativas, SEO, accesibilidad y responsive. Completada.

## Fase 2 — Supabase y dominio

Crear proyecto, migraciones PostgreSQL, Storage, datos iniciales, tipos, RLS y
tests de aislamiento. Implementar disponibilidad transaccional antes de exponer
escrituras públicas.

## Fase 3 — reservas

Búsqueda real, cotización inmutable, selección, datos del huésped, solicitud,
código único, confirmación y administración. Tests de solapamiento y carrera.

## Fase 4 — autenticación

Login, registro, recuperación, sesiones, perfiles, RBAC server-side y RLS.

## Fase 5 — administración (primera versión funcional completada)

Dashboard diario, calendario, reservas, huéspedes, pagos, tarifas, promociones,
contenido, usuarios, configuración y auditoría.

Ya implementado en modo de prueba aislado:

- dashboard de hoy y alertas;
- habitaciones en tiempo real;
- huéspedes alojados;
- reserva manual;
- ingreso directo / walk-in;
- check-in y check-out;
- pagos y saldos;
- notas internas;
- registro de auditoría en el dominio de prueba;
- autenticación del panel en el entorno publicado.

Pendiente para cerrar la fase productiva: base de datos, disponibilidad por
intervalos, usuarios y RBAC persistente, housekeeping completo, mantenimiento,
tareas, calendario, reportes e integraciones.

## Fase 6 — personal

Panel móvil para llegadas, salidas, habitaciones, limpieza e incidencias con
permisos mínimos.

## Fase 7 — cliente

Cuenta, próximas estadías, historial, pagos, acompañantes, mensajes y
pre-check-in.

## Fase 8 — operación y pagos

Housekeeping, mantenimiento, pagos manuales, comprobantes y preparación para
Mercado Pago.

## Fase 9 — analítica e integraciones

Ocupación, ADR, estadía media, canales, conversión, cancelaciones y conectores
futuros. Solo métricas accionables y con trazabilidad.

## Riesgos y decisiones pendientes

- Definir Cloudflare o Vercel antes de producción.
- Obtener proyecto Supabase y credenciales públicas/servidor.
- Confirmar inventario, capacidades, camas y tarifas reales.
- Cargar fotografías y logo definitivos.
- Aprobar cancelación, pagos, privacidad y términos.
- Definir el horario estándar definitivo de check-in.
