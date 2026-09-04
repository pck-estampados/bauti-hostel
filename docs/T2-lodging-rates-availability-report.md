# T2 LODGING RATES + AVAILABILITY REPORT

Estado: **T2 LOCAL COMPLETE**. **NO PRODUCTION VALIDATED**.

## Baseline y respaldo

- Rama: `codex/vercel-native-runtime`.
- HEAD inicial: `58410c9169101e2d9805ec9366cd26298bb794d0` (T1).
- Árbol inicial limpio; push normal de T1 autorizado y realizado a la misma rama.
- SHA remoto verificado después del push: `58410c9169101e2d9805ec9366cd26298bb794d0`.
- `main` permanece en `2e952151169734717b5e055db0aac17a7c30ed50`.
- T2 no se publicará. Sin producción, staging, nueva infraestructura ni despliegues.

## Auditoría anterior al DDL

| Concepto existente | Decisión | Evidencia y alcance |
| --- | --- | --- |
| `room_types` | REUSE / EXTEND | Categoría comercial; códigos internos lowercase ya restringidos; nombre público editable, capacidad comercial. Agregar control de venta, sin renombrar tabla ni crear categorías. |
| `rooms`, `beds` | REUSE | Habitación física, capacidad, actividad, estado operativo, camas activas con cantidad. Inventario real separado de la categoría comprada. |
| `room_assignments` | REUSE | Asignación a reserva, rango `[)`, exclusión GiST por habitación. No convertirlo en un segundo catálogo de reservas. |
| `availability_blocks` | REUSE / EXTEND | Motivo obligatorio, rango `[)`, GiST; guard compartido con assignments. Agregar conflicto con holds, sin cancelar reservas. Bloqueo por habitación suficiente en T2. |
| `private.assert_room_calendar_available` | EXTEND | Ya serializa por `pg_advisory_xact_lock(hashtextextended(room_id,0))`. Extender el mismo dominio de bloqueo a holds; conservar restricciones existentes. |
| `reservations`, `reservation_guests` | REUSE / DEFER | Flujo interno, huéspedes y ledger existentes intactos. Reserva pública final y conversión completa del hold son T3. |
| `settings` | EXTEND | Configuración estructural de TTL web/admin; sin precios comerciales. Configuración pública T1 permanece intacta. |
| `base_rate`, `pricing.base_price`, `nightly_rate` | DEFER legacy | Importes históricos/manuales, no calendario. Nunca resuelven huecos del nuevo motor. No cambiar reservas ya registradas. |
| Tarifas / promociones / special dates | CREATE | No existe modelo de reglas de alojamiento. Wellness tiene reglas propias que no representan noches y no se duplican ni modifican. |
| Quote / holds | CREATE | No existen cotizaciones nocturnas ni holds persistentes. Snapshot inmutable en hold; asignación temporal física interna. |
| RBAC/RLS/grants/auditoría | REUSE / EXTEND | Catálogo `*.read/manage`, owner/admin para nuevos permisos. RPC de escritura y lectura pública limitada; tablas sin escritura directa de clientes. |
| `private.operation_rate_limits` | EXTEND uso | Tabla privada existente con clave UUID+acción, sin FK. Reutilizar para sujeto visitante derivado del hash y límite global; no infraestructura externa. |
| APIs/repos de habitaciones y operación | REUSE | Inventario, reservas, check-in/out y wellness mantienen contratos. Nuevo servicio lodging agrupa RPC del mismo motor DB. |
| `/admin/calendario` | EXTEND | Conservar grilla de estadías y agenda wellness; agregar consulta real de disponibilidad/bloqueos/holds. |
| `/disponibilidad` | EXTEND | Formulario existente de fechas/adultos/menores; agregar categorías y cotización real, sin checkout ni pago. |
| Tests T1 / pagos / wellness | REUSE / EXTEND | Replay aislado, ACL exhaustiva, Auth real local, fixtures rollback y carreras multiconexión; ampliar contratos sin debilitar controles. |
| Folio, pagos online, POS, Customer360, Club, comunicaciones | DEFER | T3+ fuera de alcance. |

La búsqueda de rates/pricing/quotes/holds/promotions/minimum stay/allocation en migraciones, APIs, repositorios, páginas y tests no encontró otro motor de tarifas nocturnas o holds reutilizable. Los importes de wellness y las tarifas manuales de reservas no son ese motor.

## Decisiones del modelo

- Categorías conceptuales DOUBLE/LARGE_DOUBLE/FAMILY se admiten como códigos internos `double`, `large_double`, `family`, compatibles con el CHECK existente. Ninguna se crea como seed.
- Vigencia de reglas y special dates administrable. Días ISO 1=lunes a 7=domingo. Vigencia hasta inclusiva; estadía `[check_in, check_out)`.
- Precedencia: override de fecha > promoción aplicable > regla del tipo de día. Conflictos entre reglas del mismo nivel se rechazan, no se desempatan silenciosamente.
- HOLIDAY y SPECIAL requieren su regla explícita; NORMAL_OVERRIDE usa el día de semana ordinario. No se importan feriados.
- Domingo ordinario: PENDING BUSINESS CONFIGURATION. Sin regla no hay cotización; domingo feriado puede usar regla HOLIDAY.
- Promociones requieren inicio, fin y condiciones explícitas. No se activa promoción indefinida.
- Importes confirmados V1.27 sólo en documentación/fixtures, nunca en seeds o componentes: Doble 70/80/90 mil, apertura desde 60 mil; Doble Grande 85/95/105 mil, apertura desde 75 mil; Familiar 110/125/140 mil, apertura desde 100 mil. Fechas/condiciones de apertura y domingo pendientes.
- Habitaciones vendibles: activas, categoría activa con venta habilitada, capacidad comercial/física/camas suficiente, estado available/clean/ready y sin assignment/bloqueo/hold efectivo en el rango.
- Hold físico temporal en tabla propia, sin alterar `room_assignments.reservation_id NOT NULL`. Comparte el guard y candado existentes: no hay una fuente de disponibilidad paralela en frontend. GiST adicional sólo protege solapamientos entre holds.
- Un hold vencido no bloquea lecturas aunque siga ACTIVE; limpieza diferida bajo el mismo candado antes de nuevas asignaciones temporales. Cancelación controlada, snapshot inmutable, sin cron obligatorio.
- Conversión T3: una única RPC futura deberá bloquear habitación y hold, verificar titularidad/vigencia/snapshot, insertar reserva/assignment y marcar CONSUMED en la MISMA transacción. No se expone consume independiente en T2 ni liberación seguida de reserva en dos requests.

## Contratos implementados

### Tarifas, ocupación y snapshot (puntos 5–18)

`lodging_rate_rules` relaciona cada regla con `room_types`: clase DAY/PROMOTION/OVERRIDE,
tipo de día, días ISO, vigencia, importe ARS, mínimo de noches, condiciones, actividad,
venta habilitada, versión, autores y timestamps. Los solapamientos activos de igual
nivel se rechazan bajo un lock por categoría. No hay desempate comercial implícito.

`lodging_special_dates` contiene sólo fechas dadas de alta por Gerencia. La cotización
recorre noches, no días de checkout. Cada línea conserva fecha, categoría, fuente,
importe base, ajuste, importe final, moneda e ID/versión de regla. Incluye total,
timestamp y versión del contrato. Un hold persiste esa cotización y su trigger
impide cambiarla, incluso si se modifican tarifas posteriormente. El mínimo es el
máximo de los mínimos de las reglas seleccionadas para las noches de la estadía;
si no se cumple, no se emite total cotizable.

Adultos y menores suman capacidad; se requiere al menos un adulto. No hay precio
por persona ni recargo automático. Las categorías no habilitadas para venta no se
listan públicamente. Inventario puede crearse sin precio manual legacy: las dos
validaciones Zod y el formulario aceptan NULL, sin cambiar importes existentes.
El guard legacy de reservas internas permanece; su migración al contrato de
tarifas/hold corresponde a T3, no se sustituyó por un fallback automático.

### Disponibilidad, bloqueos y concurrencia (19–24)

`private.lodging_room_conflict` es el predicado común de ocupación por assignments,
bloqueos y holds efectivos. `private.lodging_room_state` agrega estado, actividad,
capacidad de habitación/categoría y suma de camas. No se usa una copia frontend
para autorizar escrituras. El rango es siempre `[check_in,check_out)`.

La creación de hold bloquea filas de habitaciones candidatas en orden UUID
(`FOR UPDATE SKIP LOCKED`), toma el mismo advisory lock de calendario existente,
marca los holds vencidos de esa habitación, revalida y crea. GiST conserva las dos
exclusiones históricas y agrega la de holds. El guard compartido rechaza conflictos
entre tablas. Las carreras locales comprobaron hold↔hold, hold↔assignment y
hold↔bloqueo, además de la exclusión histórica de reservas.

`save_lodging_block` reutiliza `availability_blocks` y exige
`rooms.inventory_manage`. Motivo obligatorio; no cancela reservas ni holds. En T2
se bloquea por habitación, suficiente para el alcance; bloqueo masivo por categoría
queda fuera para evitar una abstracción innecesaria. No se implementa reasignación
automática ni se altera un hold ya creado.

TTL estructural configurable en `settings['lodging.holds']`: web 15 minutos,
admin/WhatsApp 120 minutos iniciales; ambos entre 1 y 120. Staff puede solicitar
menos minutos, nunca más que el máximo configurado. Límite técnico de consulta:
1–60 noches y hasta 730 días de anticipación. No implica política comercial de
mínimo de estadía. Vencimiento efectivo depende de `expires_at`, no de un cron.
Cancelación es idempotente; CONSUMED está reservado y no puede alcanzarse en T2.

### Fronteras públicas y administrativas (25–29)

- RPC pública `get_lodging_availability`: sólo categoría/nombre/capacidad, conteo
  elegible, booleano, quote y razones; sin IDs de habitaciones ni PII.
- RPC pública `create_lodging_hold`: transacción limitada; anon sólo canal web,
  sin elegir TTL, habitación física, actor ni snapshot. El precio se recalcula en DB.
- `POST /api/lodging/holds`: genera identidad visitante aleatoria de 256 bits.
  Cookie HttpOnly, SameSite=Strict, Secure bajo HTTPS, path limitado. DB guarda
  SHA-256, no el token. No se guardan tokens en URLs, logs, auditoría ni archivos.
- `DELETE /api/lodging/holds`: exige ID opaco más la cookie de la misma sesión.
  Ningún endpoint público lista holds ni consume reservas. Sin la identidad correcta,
  cancelación denegada; un ID solo no autoriza nada. Una recarga pierde la vista local
  del hold, pero nunca libera la retención: su TTL sigue vigente en DB. Recuperación
  de flujo y conversión definitiva se completarán en T3.
- Rate limit DB sin infraestructura nueva: tabla privada `operation_rate_limits`,
  5 creaciones exitosas/minuto por identidad y 120 globales/minuto, más 1 hold web
  activo por visitante. Valores conservadores, no configuraciones comerciales.
  Rotar cookies no evade el límite global; no se promete prevención absoluta de bots.
- Toda mutación HTTP exige Origin explícito igual al Host, rechaza cross-site y HTTP
  no local. Se considera la normalización interna de hostname de Next.js. Sin CORS
  abierto y sin confiar en un `x-forwarded-host` arbitrario.
- RPC SECURITY DEFINER sólo donde hace falta leer/operar sin SELECT/INSERT genérico;
  search_path vacío, parámetros validados, permisos explícitos y helpers privados
  revocados para clientes. No se emplea service_role ni claves privadas.
- Nuevos permisos: `rates.read/manage`, `availability.read/manage`, sólo owner/admin.
  Matriz final owner=30, admin=28, housekeeping=2, bar=0, reception=13, maintenance=3.
- Nuevas tablas con RLS; authenticated lee tarifas/fechas según rates.read. Holds
  tienen grant por columnas públicas administrativas, nunca `visitor_hash`. No hay
  INSERT/UPDATE/DELETE directo de clientes en las tres tablas. RPC staff verifica
  perfil active y permisos en DB, además de la verificación SSR del usuario.

### Interfaces y auditoría (30–33)

- `/admin/tarifas`: categorías, habilitar/deshabilitar venta, reglas/promociones,
  alta/edición/desactivación, filtro de categoría, special dates y TTL.
- `/admin/calendario`: conserva grilla histórica y agenda wellness; agrega consulta
  DB de rango/categoría/personas, desglose nocturno con huecos, habitaciones por
  motivo, creación/cancelación de holds y bloqueo con motivo. La grilla histórica
  dice “Sin reserva”, no promete disponibilidad ignorando holds.
- `/disponibilidad`: reutiliza el formulario, muestra categorías, tarifa completa
  y noches; permite hold temporal y cancelarlo. No crea reserva ni cobro. Errores o
  configuración incompleta producen estados explícitos, nunca inventario demo.
- Eventos redacted: RATE_CREATED/UPDATED/DISABLED, SPECIAL_DATE_CHANGED,
  HOLD_CREATED/CANCELLED/EXPIRED; HOLD_CONSUMED reservado para T3. Sin datos de
  huéspedes, texto de condiciones, tokens, hashes ni snapshots completos en auditoría.

### Migración (34)

Nueva: `supabase/migrations/20260904160115_lodging_rates_availability_and_holds.sql`,
creada con Supabase CLI 2.116.0 mediante `migration new`. No modifica las 14 anteriores.
Tres tablas, tres RLS SELECT, índices/FK, diez RPC públicas con grants explícitos,
helpers/triggers y extensión del guard existente. Sólo seeds estructurales:
cuatro permisos, ocho asociaciones owner/admin y configuración de TTL. Cero seeds
de categorías, habitaciones, tarifas, promociones, feriados, holds o personas.

## Validaciones y reproducción (35–49)

| Comprobación | Resultado |
| --- | --- |
| Replay L1→T1→T2 local desde vacío | PASS, 15 migraciones |
| Bootstrap | 34 tablas públicas con RLS, 3 exclusiones GiST; estructura y grants comprobados |
| ACL efectiva | 344/344 entradas: 42 permitidas, 302 denegadas; ampliación sólo con las diez RPC nuevas |
| Pricing / disponibilidad / holds | 72 aserciones DB PASS, incluidas pruebas 1–44 requeridas y bordes adicionales |
| Concurrencia | Un ganador en último cuarto; hold vs assignment y vs bloqueo rechazados |
| Regresión T1 | Auth real local, owner, limpieza/bar, pending/disabled/sin rol, RLS y auditoría PASS |
| Pagos | Ledger, límites, anulación, secuencias e historial PASS |
| Wellness | Operaciones y carrera de último cupo PASS |
| App tests | 243/243 PASS (baseline 202 + 41 T2); sin skips |
| App HTTP real | CRUD tarifas, fecha especial, TTL, venta categoría, cotización, holds web/staff, cancelación propia y rechazo ajeno PASS |
| Visual | Chrome headless, 390 y 1280 px, las tres rutas; revisión de capturas, etiquetas, teclado, no overflow ni error overlay |
| npm ci | PASS, dependencias/lockfile sin cambios de versiones |
| lint / TypeScript / build | PASS |
| npm audit completo | 0 vulnerabilidades |
| Advisors locales finales | 0 errores, 0 alertas SECURITY, 10 WARN PERFORMANCE preexistentes por policies permisivas superpuestas; ningún objeto nuevo T2 señalado |
| git diff --check | PASS |

Después del último reset: `room_types`, `rooms`, `beds`, `lodging_rate_rules`
(incluidas promociones), `lodging_special_dates`, `lodging_holds`, `guests`,
`reservations`, `payments`, `wellness_products`, `wellness_slots`, `wellness_bookings`,
`auth.users` y `storage.objects`: **0 filas**. El check de bootstrap comprueba además
todas las demás tablas de negocio, no sólo esta lista. Estructura: 6 roles,
30 permisos, 76 asociaciones, 6 servicios, 4 settings y 24 eventos de auditoría
estructural sin actor de negocio. No quedaron identidades ni counters de pruebas.

Comandos usados (PowerShell; launcher evita `.env.local` productivo):

```powershell
npm ci
npm run lint
npm run typecheck
npm run app:local -- build
npm run app:local -- test
npm audit
npm run db:local -- check
npm run test:db
npm run db:local -- advisors
git diff --check
```

El harness de pruebas realiza reset LOCAL en `finally`, también al fallar. La
integración HTTP se activa con `$env:T1_APP_TESTS='1'`. Para screenshots se añade
`$env:T2_BROWSER_TESTS='1'` y `PLAYWRIGHT_MODULE_PATH` apuntando al `index.mjs` del
Playwright ya instalado en el entorno. No se agregó dependencia al proyecto.
Capturas en `outputs/t2/`, ignoradas por Git. Nunca se exportan cookies o estado Auth.

Durante validación se corrigieron: sintaxis de CASE en rate limit, tipo smallint
frente al retorno integer de capacidad, comparación de columnas generadas en el
guard de inmutabilidad y la validación de Origin ante hostname interno de Next.js.
Los fallos se investigaron y se repitieron las pruebas afectadas, sin omitir checks.

## Cierre y pendientes (50–57)

- Commit local de cierre: `feat: add lodging rates availability and holds`.
  Su SHA se informa en la entrega; el propio documento no intenta contener su hash.
- No push de T2, PR, merge, deploy, cambios productivos, staging ni infraestructura.
- El árbol se revisa antes/después del commit; `.env.local` sigue ignorado, sin
  archivos de entorno, cookies, claves, screenshots ni logs en el commit.
- T3: conversión atómica hold→reserva/assignment, actualización del guard legacy de
  inventario/tarifa manual, continuidad del flujo público al recargar, checkout,
  depósito/pago, folio, políticas de cancelación y comunicaciones según alcance futuro.
- Datos comerciales pendientes: altas reales de categorías/nombres/capacidades;
  habitaciones/camas vendibles; fechas de vigencia de tarifas; domingo ordinario;
  feriados/special dates; fechas y condiciones de la promo de apertura. No se cargan
  automáticamente importes ni inventario a partir de referencias del Handoff.

Para abrir localmente: `npm run app:local -- dev`. URLs:
`http://127.0.0.1:3000/admin/tarifas`,
`http://127.0.0.1:3000/admin/calendario`,
`http://127.0.0.1:3000/disponibilidad`.
La DB final no contiene usuarios de prueba: el login productivo no autentica en
Supabase local. No copiar credenciales ni usuarios de producción para hacer demos.

## Referencias técnicas consultadas

- [Supabase changelog](https://supabase.com/changelog): grants explícitos de tablas nuevas; no cambios de dependencias ni extensiones necesarias.
- [PostgreSQL locks](https://www.postgresql.org/docs/current/explicit-locking.html): locks transaccionales y orden consistente.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security): permisos mínimos y funciones con frontera explícita.
- Guía instalada de Next.js 16.3.3 para Route Handlers: APIs web, cookies server-side y parámetros async.
