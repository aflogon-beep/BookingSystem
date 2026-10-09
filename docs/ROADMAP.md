# Roadmap

Cada tarea se lanza en Claude Code con `/nueva-funcionalidad <nº>`. Marca `[x]` al mergear.

## Fase 0 — Cimientos
- [x] 0.1 Crear app Next.js + TypeScript + Tailwind + shadcn/ui + ESLint, scripts `lint`, `typecheck`, `test`, `test:e2e` y `build`.
- [x] 0.2 Vitest y Playwright configurados con un test de ejemplo cada uno. CI en verde.
- [x] 0.3 Supabase local (`supabase init`), clientes `server.ts` y `admin.ts` (`server-only`), tipos generados. _(Tipos provisionales a mano: se generan con `npm run db:types` en la 1.1.)_
- [x] 0.4 Tokens de diseño (skill `diseno-ui`) en Tailwind y shadcn. Layout del panel con barra superior, navegación y barra de pestañas móvil.
- [x] 0.5 Login del equipo (Supabase Auth, email + contraseña), proxy que protege `(panel)` y tabla `staff` con roles. Contraseñas: mínimo 10 con mayúsculas, minúsculas y dígitos. Alta con `npm run staff:create`. CI con Supabase (migraciones, tipos, RLS y e2e con login).

## Fase 1 — Núcleo de reservas
- [x] 1.1 Migración: settings, ticket_types, products, product_prices, schedule_rules y RLS. Seed de la empresa de ejemplo. Tipos regenerados con `npm run db:types`. RLS: el staff gestiona productos, precios y horarios; ajustes y tipos de entrada solo admin; anon sin acceso.
- [x] 1.2 Ajustes: empresa, idiomas, tipos de entrada y políticas. Equipo: invitar miembros, cambiar rol y dar de baja (con doble campo de contraseña al aceptar la invitación).
- [x] 1.3 Productos: editor con pestañas, subida de foto a Storage y vista previa de salidas.
- [x] 1.4 `generate_sessions` + cron diario + tests de zona horaria.
- [x] 1.5 Calendario (semana por defecto y mes) con ocupación.
- [x] 1.6 Migración de reservas (bookings, booking_lines, booking_events, customers) + `create_booking_hold` + test de concurrencia.
- [x] 1.7 Nueva reserva interna (modal) con canales y métodos de pago.
- [x] 1.8 Hoy: KPIs, salidas del día y actividad.
- [x] 1.9 Manifiesto: pasajeros, check-in, cobrar y estado y aforo de la salida.

## Fase 2 — Venta online
- [x] 2.1 Web pública: listado y ficha de tour con calendario y horarios.
- [ ] 2.2 Checkout con Stripe + webhook + página de confirmación. Hecho (sin pasarela, decisión de 2026-10-09): formulario de reserva, reserva confirmada con pago en el lugar y página de confirmación. Falta: Stripe Checkout y webhook.
- [x] 2.3 Emails con Resend: confirmación, recordatorio 24 h y cancelación. Se activan al poner `RESEND_API_KEY` y `EMAIL_FROM` en Vercel.
- [ ] 2.4 Cancelación y reembolso, y cambio de fecha (ficha de reserva).
- [ ] 2.5 i18n ES/EN de la web pública.

## Fase 3 — Operación avanzada
- [ ] 3.1 Recursos: fichas, idiomas y asientos. Restricción de solapes en BD.
- [ ] 3.2 Asignación automática y manual en el manifiesto.
- [ ] 3.3 Equipo · "Dónde están" (línea de tiempo) y planificación semanal.
- [ ] 3.4 Reservas: listado con pestañas, filtros y CSV. Clientes.
- [ ] 3.5 Informes.
- [ ] 3.6 Avisos (sin equipo, bajo mínimo) y asistente de configuración inicial.

## Fase 4 — Producción
- [ ] 4.1 `/revision-seguridad` completa + `npm audit` + revisión externa.
- [ ] 4.2 Proyecto Supabase de producción, backups (PITR) y migraciones desde CI. Hecho: migraciones desde CI (workflow `Migraciones`, aplica `supabase/migrations` al fusionar en `main`). Falta: backups (PITR).
- [ ] 4.3 Vercel producción, dominio, variables de entorno y Stripe en modo live con webhook.
- [ ] 4.4 Monitorización (Sentry) y alertas de webhook fallido.
- [ ] 4.5 Textos legales: privacidad, condiciones y cookies.
- [ ] 4.6 Piloto con un tour durante 2 semanas.

## Más adelante
Guías con su propio acceso y manifiesto móvil · cupones y tarjetas regalo · agencias con comisión · GPS (app de guía + mapa) · alemán · multi-empresa.
