# Hostel Bauti

Plataforma web y operativa de Hostel Bauti, en Ezeiza. Incluye la experiencia
pública y una primera versión funcional del panel de administración.

## Requisitos

- Node.js 22.13 o posterior.
- npm.

## Desarrollo local

```bash
npm install
npm run dev
```

La aplicación queda disponible en `http://localhost:3000`. El script de inicio
es multiplataforma: configura Wrangler desde Node y funciona en Windows, macOS
y Linux sin sintaxis específica del shell.

## Comandos

```bash
npm run dev       # servidor local
npm run build     # build de producción con vinext
npm test          # build y pruebas de renderizado
npm run lint      # análisis estático
```

## Estado actual

- Home pública responsive.
- Presentación real de habitaciones privadas sin publicar inventario no confirmado.
- Buscador de fechas que prepara una consulta dinámica completa para WhatsApp.
- Servicios, espacios confirmados, mapa real, ubicación, preguntas frecuentes,
  contacto y páginas legales iniciales.
- Metadata, datos estructurados, sitemap y robots.
- Dashboard operativo responsive en `/admin` con datos de prueba aislados.
- Habitaciones en tiempo real, huéspedes alojados, reservas, walk-in, check-in,
  check-out, pagos, saldos y notas internas.
- Transiciones funcionales en memoria para validar los flujos antes de conectar
  la base de datos definitiva.
- Autenticación obligatoria en producción mediante la identidad provista por la
  plataforma; bypass de datos demo únicamente en desarrollo local.
- La base D1/Drizzle del starter está vacía y no se usa en producción.
- Supabase aún no está conectado porque requiere proyecto y credenciales.

Los cambios realizados dentro del panel demo se descartan al recargar. No debe
utilizarse para almacenar datos personales reales hasta conectar persistencia,
RBAC server-side y políticas de acceso en la base de datos.

La arquitectura, el modelo de datos propuesto y el roadmap están documentados
en `docs/`.
