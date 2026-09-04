# T1 CORE MODEL + SECURITY REPORT

Estado: **T1 LOCAL COMPLETE**. Validación local; no PRODUCTION VALIDATED.
HEAD inicial: `6d6fc9e31d22b3d9c81ba113303fcf159509e48e`.
Rama: `codex/vercel-native-runtime`. No push, producción, staging ni deploy.

## Auditoría previa a cambios

Fuente funcional: Handoff Maestro V1.27. Se utiliza el extracto confirmado del pedido T1; el documento maestro completo no está versionado y se solicitó su ubicación. No se infieren reglas ausentes.

| Área | Clasificación | Decisión |
| --- | --- | --- |
| settings y UI de configuración | EXTEND | Conservar claves técnicas hostel.*, incorporar descriptor/país, desayuno y cortesía condicional. Validar en servidor y DB |
| configuración pública | EXTEND | Conservar RPC pública limitada; versión tipada ampliada y compatibilidad sin tarifa universal |
| perfiles/Auth/user_roles | KEEP | Supabase Auth staff, active + rol + permisos; sin Auth cliente ni credenciales seed |
| roles y matriz RBAC | EXTEND | Mantener cinco códigos/IDs, agregar bar dormido; Gerencia owner/admin; no POS |
| Limpieza | REFACTOR | rooms.read permite notas/estructura innecesarias; reemplazar por proyección mínima y RPC de estado existente |
| funciones RBAC/RLS | KEEP/EXTEND | Conservar helpers y RPC operativas; restringir acceso directo de Limpieza a tareas/notas y settings |
| guests | KEEP/DEFER | Persona alojada/contacto operativo, no auth user/staff/customer/club member; Customer 360 en T5 |
| reservations y estados | KEEP/EXTEND | Enum legacy intacto; capa de compatibilidad lifecycle separada del estado financiero derivado del ledger |
| payments/financials | KEEP | posted/voided = estado de movimiento; pagos/saldo derivados de payments, nunca del estado legacy de reserva |
| room_types | KEEP | Implementación interna de categoría; PUBLIC SALE = categoría, PHYSICAL ASSIGNMENT = room |
| rooms/beds/availability | KEEP | Inventario vacío, asignación física y exclusión anti-overbooking actuales; venta por categoría/holds en T2 |
| pricing.base_price | DEFER/REFACTOR | Compatibilidad interna legacy, no tarifa pública canónica; motor por categoría/fecha/tipo de día/promos/snapshots en T2 |
| wellness | KEEP | Sin cambios de capacidad, ventanas, pagos ni concurrencia; Club Relax y POS fuera de T1 |

Contradicciones detectadas: check-in 08:00 y checkout 10:00; mascotas con consulta; fallback/precio público universal ARS 60.000; descriptor/país/desayuno/cortesía ausentes de settings; lectura amplia de rooms y housekeeping_tasks para Limpieza; admin sin capacidades posteriores de media/wellness; estados paid/partially_paid en enum de reservas. No se borrarán estados ni roles existentes.

Decisión de proyecto: staging diferido hasta cerca de T9. La aceptación T1 será LOCAL REPLAY + DB TESTS + APP TESTS, nunca PRODUCTION VALIDATED. Las 13 migraciones existentes permanecen inmutables; los cambios van en una nueva migración exclusivamente local.

## Configuración canónica (puntos 4–9)

Antes: el bootstrap no contenía settings; el fallback de aplicación tenía ingreso
08:00–22:00, salida 10:00, mascotas con consulta y tarifa universal ARS 60.000.
No se consultaron ni copiaron settings productivos en T1.

Ahora, tres filas estructurales privadas, validadas con Zod y trigger PostgreSQL:

| Clave | Valores T1 |
| --- | --- |
| hostel.general | Casa Albor; Casa boutique · Estadías & Experiencias; Uruguayana 235; Ezeiza; Buenos Aires; Argentina |
| hostel.schedules | Check-in desde 15:00; fin no confirmado vacío; checkout 11:00; cortesía hasta 12:00 siempre con autorización; desayuno 08:00–10:00; descanso 23:00–08:00 |
| hostel.policies | No mascotas de huéspedes/visitantes; no fumar en interiores; menores acompañados; respeto del descanso; cancelación pendiente; divulgación de mascotas residentes separada y vacía |

Teléfono, WhatsApp, email y website nuevos quedan vacíos: no se copian de producción.
Si en una base ya existen contactos, el upsert de general los conserva.
El sitio maneja ausencia de WhatsApp sin enlaces wa.me vacíos ni afirmar un envío.
No se fija dominio, aforo, capacidad wellness, inventario ni una hora de cierre no confirmada.
La configuración permite editar los campos T1 sin redeploy; mascota admitida=false
y autorización de cortesía=true son invariantes de negocio, no toggles libres.
La cancelación permanece visible como pendiente, y la lista inicial no marca
configuración terminada hasta completar políticas e inventario.

`pricing.base_price` sólo se marca como legacy interno si existe. No se crea un
precio nuevo. El público y JSON-LD ya no consumen ese importe ni `priceRange`.
El RPC anterior mantiene su firma con `base_price_ars=NULL`, evitando ruptura de ABI.

## Modelo y transición (puntos 10–12, 21)

Se conservan room_types, rooms, guests, reservations, payments y financials.
PUBLIC SALE = categoría (room_types); PHYSICAL ASSIGNMENT = room. Sin venta pública.
`reservation_lifecycle` es una vista security_invoker y una función TS equivalente:
estados operativos explícitos se conservan; paid/partially_paid se proyectan a
confirmed salvo evidencia de check-in/out real. No hay backfill ni nuevo saldo.
Los escritores/RPC actuales y enum siguen intactos; en T3 se migrarán tras revisar
datos históricos, actualizar consumidores y probar todas las transiciones.
`payments.status` posted/voided describe un movimiento; paid/balance derivan de
movimientos y reservation_financials. Una reserva legacy paid con cero movimientos
se prueba como lifecycle=confirmed y paid_total=0, nunca como llegada o pago real.

guest = persona/contacto de alojamiento. auth user + profile + roles = personal.
Customer, club member e identidad del cliente no se confunden con esas entidades;
su vinculación explícita y Customer 360 quedan para T5, sin alterar guests en T1.

## Roles, Auth y mínimo privilegio (puntos 13–20)

| Código estable | Nombre funcional | Permisos efectivos | Decisión |
| --- | --- | ---: | --- |
| owner | Gerencia / Super admin | 26 | Todas las capacidades; seguridad y auditoría reservadas al owner |
| admin | Gerencia | 24 | Operación completa incluyendo media/wellness; sin rbac.manage ni audit.read |
| housekeeping | Limpieza | 2 | housekeeping.read y housekeeping.manage; sin rooms.read |
| bar | Barra preparado | 0 | Sin POS, reservas, documentos, configuración ni pagos |
| reception | Recepción futura | 13 | Conservada sin ampliaciones; no necesaria para MVP |
| maintenance | Mantenimiento fuera del MVP | 3 | Conservada sin ampliaciones |

No cambian IDs/códigos existentes. Se añade bar y cuatro asociaciones operativas
a admin; se revoca únicamente rooms.read de housekeeping.
La lectura de Limpieza usa get_housekeeping_room_state(): habitación/código/nombre,
sector, estado, cleaning_note dedicada y estado de tarea. No devuelve huésped,
documento, reserva, importes, status_note, internal_notes ni notas privadas de tareas.
El campo cleaning_note está preparado para instrucciones mínimas; no se copian
notas legacy. No se construye un gestor nuevo de observaciones en T1.
El panel /admin/limpieza reutiliza la RPC de estado existente. Un guard impide a
Limpieza sacar habitaciones de mantenimiento/bloqueo/fuera de servicio. Se mantiene
pending_cleaning → cleaning → clean → ready, sin saltos ni liberación automática.
Barra muestra una pantalla de rol preparado; la navegación respeta capacidades.

Auth requiere usuario validado con Supabase, perfil active y al menos un rol.
Permisos se obtienen de DB, no del metadata del JWT. No se usan claves secretas.
El owner de prueba se crea exclusivamente en el harness local, con contraseña
aleatoria en memoria; fixtures SQL se revierten o resetean, nunca quedan como seeds.

## Contrato público y seguridad (puntos 22–23, 27–29)

get_public_site_configuration_v127() tiene 23 columnas tipadas y lista fija de tres
claves. No acepta nombres de settings como parámetros. Anon no puede leer settings;
no se exponen updated_by, email/website internos, valores arbitrarios, notas, fiscal,
roles, auditoría ni precios legacy. El adaptador es server-only y usa sólo anon.
SECURITY DEFINER se limita a las proyecciones que deben leer tablas privadas y al
trigger de auditoría: search_path vacío, objetos cualificados, EXECUTE explícito.
La proyección de Limpieza exige permiso vigente dentro de la RPC; la pública no
admite entradas. Las funciones privadas nuevas no conceden EXECUTE a clientes.
La vista lifecycle usa security_invoker y RLS de reservas, sin acceso anon.
Auditoría de settings registra actor, operación y clave, nunca el valor completo.
JSON-LD escapa '<' para que configuración editable no pueda cerrar el script.

Referencias comerciales antiguas eliminadas de la UI activa/README. Se conservan
identificadores técnicos: repo bauti-hostel, paquete, hostel.*, hostel-media,
funciones/archivos históricos y origen ficticio técnico de validación de redirects.
El enlace Instagram histórico confirmado se conserva sin presentar el handle
antiguo como marca. Su eventual reemplazo requiere una URL confirmada.
docs/supabase-setup.md queda explícitamente archivado: no ejecutar sus instrucciones.

## Migración y validaciones (puntos 24–37)

Nueva migración: `20260904043936_align_core_model_with_handoff_v127.sql`, creada
con Supabase CLI 2.116.0 `migration new`, aplicada sólo en Docker local.
L1–L13 no tienen cambios. Proyecto local fijo casa-albor-bootstrap, API 55421 y DB
55422; el wrapper rechaza workspaces linked, URLs DB externas y Docker remoto.
El launcher de Next inyecta variables locales sin tocar .env.local; HTTP Supabase
sólo se permite en loopback:55421. Artefactos Next y claves públicas locales
compiladas quedan ignorados, no versionados.

| Verificación | Resultado |
| --- | --- |
| npm ci | PASS, lockfile y versiones sin cambios |
| npm run lint | PASS |
| npm run typecheck | PASS |
| npm run build (mediante app:local) | PASS, Next.js 16.3.3 |
| npm test (mediante app:local) | 202/202 PASS, baseline 191 ampliado |
| npm audit --json | 0 vulnerabilidades en todas las severidades |
| Replay local L1–L14 | PASS, incluidas constraints/grants/bucket/RLS |
| ACL efectiva | 264/264 entradas verificadas; 29 permitidas / 235 denegadas |
| SQL T1 | Settings/horarios/mascotas, seis roles, mínimo privilegio, validación directa y RPC público PASS |
| Regresión SQL | Payments/void, redacción de 7 tablas, códigos/historias, Auth real y RBAC PASS |
| Concurrencia | Habitaciones y último cupo wellness: un commit y un rechazo controlado, PASS |
| Panel Next + Auth real | Owner cookies/SSR/recarga, leer/guardar/validar settings, logout, anon, aislamiento Limpieza/Barra y rechazo pending/disabled/sin rol PASS |
| Advisors locales finales | 0 errores y 0 alertas SECURITY; 10 WARN PERFORMANCE por policies permisivas superpuestas existentes |
| git diff --check | PASS antes del commit |

Incidencias resueltas: delimitador SQL en la migración nueva, orden del snapshot
ACL, cast UUID de fixtures y precondición del flujo de limpieza. Tres expectativas
HTML legacy (horarios/contacto/URL loopback) se actualizaron, conservando pruebas
de armado de WhatsApp mediante fixtures unitarios sin envío. Una lectura de advisors
durante el reset se descartó; sólo se informa la lectura posterior al replay completo.
Los 10 avisos de rendimiento no amplían privilegios; no se refactorizan políticas
ajenas a T1. No se afirma equivalencia con advisors productivos ni UAT remoto.

Datos finales verificados por el harness tras el último reset: huéspedes,
reservas, pagos, room_types, rooms, beds, wellness_products/slots/bookings,
Auth users y Storage objects = 0. Sólo roles=6, permisos=26, asociaciones=68,
servicios=6, settings=3 y sus auditorías estructurales permanecen.

## Cierre y siguiente fase (puntos 38–45)

Commit local previsto: `feat: align core model with handoff v1.27`.
El SHA final y estado limpio se informan después de crearlo (no se autoreferencia
el hash dentro del contenido del mismo commit).
NO PUSH. NO PR. NO MERGE. NO PROD CHANGES. NO STAGING. NO DEPLOY.
No se ejecutó db push, migration repair ni ninguna escritura remota; no se instaló
Docker, no se creó proyecto Supabase/Vercel y no se modificaron datos productivos.

Gaps explícitos: T2 tarifas/categoría/fecha/tipo de día/promos/snapshots/holds;
T3 migración de escritores legacy/folio/reserva final/pagos online;
T5 Customer 360/Auth cliente/club; T6 POS Barra. T4/T7/T8 no implementados.
Pendientes funcionales: cancelación de alojamiento, contacto Casa Albor a publicar,
hora final de check-in, dominio/email definitivos, aforo e inventario confirmado,
divulgación de mascotas residentes si corresponde. No se rellenan por inferencia.

Uso local posterior: `npm run db:local -- start` y `npm run app:local -- dev`;
sitio http://127.0.0.1:3000, configuración /admin/configuracion, limpieza /admin/limpieza.
El bootstrap final no deja usuarios: Auth real se prueba con el harness, no con
credenciales permanentes. Staging/UAT remoto se retomarán cerca de T9 por decisión
expresa del proyecto. Resultado: **T1 LOCAL COMPLETE**; sin validación productiva.
