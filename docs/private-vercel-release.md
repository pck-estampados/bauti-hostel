# Casa Albor: publicación privada real

Esta rama conserva la aplicación real con APP_MODE=production y Supabase remoto.
No es una demo. Las migraciones requieren autorización separada; nunca ejecutar
db push contra el historial productivo consolidado.

La publicación privada usa metadata noindex/nofollow, robots Disallow: / y
X-Robots-Tag. Estas reglas no sustituyen autenticación. El panel conserva su
sesión Supabase, perfil active, RLS y permisos actuales en DB.

El plan Vercel actual rechazó protección de todos los deployments de producción
(HTTP 428). No se compró un add-on. Se usa **Preview protegido** de
codex/vercel-native-runtime, con la aplicación y la base reales. No promover a
Production ni asignar un alias público mientras no exista una decisión expresa
sobre protección. No configurar dominio personalizado.

git.deploymentEnabled=false evita builds automáticos que puedan publicar por
accidente un alias de producción. Flujo: revisión → push de esta rama → deployment
Preview explícito del SHA aprobado → comprobar protección/noindex/Auth. No main.
La conexión Git no implica autorización para desplegar automáticamente cambios
futuros, ejecutar migraciones o habilitar ventas.

Variables Preview: APP_MODE=production, NEXT_PUBLIC_SITE_URL con la URL HTTPS
asignada/verificada, NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
No secret/service-role. No guardar claves en archivos versionados ni usar
`vercel env pull .env.local` para reemplazar configuración local.

El build remoto toma el hostname HTTPS asignado por Vercel (URL de rama, o URL
del deployment si no hay alias de rama). No se inventa un dominio previo al
primer deployment. Después se registra la URL asignada en la variable Preview.
`.vercelignore` limita la subida de la CLI a las fuentes de la aplicación y su
configuración de build; excluye entornos, logs, snapshots, tests y migraciones.
Antes de subir se comprueba el manifiesto con `vercel deploy --dry --json`.

Validación focalizada, sin fixtures ni modo demo:

```powershell
npm run lint
npm run typecheck
npm run build
npm run test:deployment
```

El último comando requiere build previo y configuración real local; sólo hace GET
a rutas públicas y checks anónimos del panel/API. No prueba un login de una persona
ni crea negocio. Las suites históricas de tests aislados no son evidencia de un
deployment real; deben distinguirse de estas pruebas y de la verificación online.

Referencias: [protección Vercel](https://vercel.com/docs/deployment-protection),
[desactivar autodeploy Git](https://vercel.com/docs/project-configuration/git-configuration).
