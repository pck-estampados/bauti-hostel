# Configuración de Supabase para Fase 2

## Estado de esta entrega

El código, los adaptadores y las migraciones están preparados. No se aplicó
aún ninguna migración ni se cambió el checkpoint publicado porque faltan las
credenciales de un proyecto Supabase real. Hasta completar este procedimiento,
usar exclusivamente `APP_MODE=demo` con información ficticia.

## 1. Crear el proyecto

1. Crear un proyecto nuevo de Supabase para Hostel Bauti.
2. Elegir una región cercana a Buenos Aires.
3. Guardar la contraseña de base de datos en un gestor de secretos.
4. No crear habitaciones, huéspedes ni reservas desde ejemplos o plantillas.

## 2. Configurar variables locales

Crear `.env.local` en la raíz del proyecto. El archivo ya está ignorado por Git.
No pegar sus valores en un chat, issue, commit, captura ni log.

```dotenv
APP_MODE=demo
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
SUPABASE_SECRET_KEY=sb_secret_REPLACE_ME
NEXT_PUBLIC_BASE_PRICE_ARS=50000
```

Supabase recomienda las claves nuevas `sb_publishable_...` y `sb_secret_...`.
Si el proyecto solo ofrece claves heredadas, la clave `anon` puede ocupar
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y la `service_role` debe guardarse como
`SUPABASE_SERVICE_ROLE_KEY`. Nunca usar una clave secreta con `NEXT_PUBLIC_`.

En el entorno publicado deben cargarse los mismos nombres mediante el sistema de
variables/secrets del hosting. `APP_MODE` se cambia a `production` solamente
después de aplicar migraciones, crear el primer usuario y verificar RLS.

## 3. Aplicar migraciones en orden

Ejecutar, en una base nueva y en este orden, los archivos de
`supabase/migrations/`:

1. `202607150001_core_operational_schema.sql`
2. `202607150002_rbac_and_rls.sql`
3. `202607150003_atomic_operations.sql`
4. `202607150004_automatic_audit.sql`

Cada migración usa una transacción. Si una falla, no continuar con la siguiente:
conservar el error sin incluir secretos y corregir primero la causa.

Las migraciones crean estructura, roles y permisos. Deliberadamente no insertan
habitaciones, camas, huéspedes, reservas ni pagos. El inventario productivo queda
vacío hasta que David aporte información confirmada.

## 4. Configurar Supabase Auth

En Authentication:

- habilitar email y contraseña;
- deshabilitar el registro público de usuarios;
- configurar la URL del sitio y los redirects permitidos para
  `/auth/callback` y `/actualizar-clave`;
- exigir contraseñas robustas y mantener la protección de intentos de Supabase;
- crear personal mediante invitación administrativa, nunca desde una pantalla
  pública.

## 5. Crear el primer propietario

Aplicar primero todas las migraciones y luego invitar el correo de David desde
el panel de Auth. Cuando el usuario exista, ejecutar en SQL Editor reemplazando
solo el marcador de correo:

```sql
begin;

update public.profiles
set status = 'active'
where id = (
  select id from auth.users where lower(email) = lower('DAVID_EMAIL_HERE')
);

insert into public.user_roles (user_id, role_id, assigned_by)
select user_account.id, role.id, user_account.id
from auth.users user_account
join public.roles role on role.code = 'owner'
where lower(user_account.email) = lower('DAVID_EMAIL_HERE')
on conflict do nothing;

commit;
```

Los usuarios nuevos nacen `pending` y sin rol. Aunque alguien lograra crear una
cuenta fuera del flujo previsto, RLS no le permite acceder a datos operativos.

## 6. Verificación antes de producción

- ejecutar `npm run lint`, `npm test` y el Security Advisor de Supabase;
- probar propietario, recepción, limpieza y mantenimiento con cuentas separadas;
- comprobar que limpieza no ve huéspedes ni pagos;
- intentar dos reservas simultáneas para la misma habitación y rango;
- verificar walk-in, check-in, pago, check-out, limpieza, notas y auditoría;
- confirmar que una salida y una entrada el mismo día no se solapan gracias al
  rango semiabierto `[check_in, check_out)`;
- recargar y cerrar/abrir sesión para confirmar persistencia real;
- recién entonces usar `APP_MODE=production` y preparar un despliegue controlado.
