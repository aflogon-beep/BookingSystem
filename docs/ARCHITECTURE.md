# Arquitectura

## Vista general

```
Cliente (móvil/web) ──▶ Next.js en Vercel ──▶ Supabase (Postgres + Auth + Storage)
                            │   ▲
                            ▼   │ webhooks firmados
                          Stripe Checkout
                            │
                          Resend (emails)
```

- La web pública y el panel son la misma app Next.js, en grupos de rutas `(public)` y `(panel)`.
- La lógica de negocio pura vive en `src/lib/domain/`. Las operaciones atómicas (bloquear plazas, confirmar pago, generar salidas) viven en funciones SQL.
- Un cron diario (Vercel Cron, `vercel.json`, 03:00 UTC) llama a `/api/cron/generar-salidas`, que ejecuta `generate_sessions(hoy, hoy + 120)` con service role. Solo entra con `Authorization: Bearer $CRON_SECRET` (variable de entorno de Vercel, al menos 16 caracteres). Más adelante enviará también los recordatorios (2.3).

## Modelo de datos (borrador para la primera migración)

```sql
settings(id int pk default 1 check (id = 1), business_name, currency, timezone default 'Atlantic/Canary',
         languages text[], cutoff_hours int, cancel_hours int, default_capacity int, email, phone)

staff(user_id uuid pk references auth.users, name, role check in ('admin','staff'))

ticket_types(id uuid pk, name, note, takes_seat bool default true, sort int)

products(id uuid pk, slug unique, name, description, meeting_point, place,
         duration_min int, capacity int, min_pax int, pickup bool, color, photo_path,
         active bool default true)

product_prices(product_id fk, ticket_type_id fk, price_cents int check (>=0), pk(product_id,ticket_type_id))

schedule_rules(id uuid pk, product_id fk, weekdays int[], times time[], language,
               valid_from date null, valid_to date null)

product_needs(product_id fk, resource_type check in ('guide','vehicle','equipment'), qty int)

sessions(id uuid pk, product_id fk, starts_at timestamptz, ends_at timestamptz, language,
         capacity int, status check in ('open','closed','cancelled'),
         unique(product_id, starts_at))

resources(id uuid pk, name, type check in ('guide','vehicle','equipment'),
          seats int, languages text[], active bool)

session_resources(session_id fk, resource_id fk, pk(session_id, resource_id))
  -- + restricción de exclusión (btree_gist) para impedir solapes del mismo recurso

customers(id uuid pk, name, email, phone, created_at)

bookings(id uuid pk, code text unique, session_id fk, customer_id fk,
         status check in ('pending','confirmed','cancelled','expired'),
         payment_status check in ('pending','paid','refunded','invoice'),
         payment_method, channel check in ('web','phone','desk','agency'), agent,
         hotel, notes, total_cents int, paid_cents int,
         hold_expires_at timestamptz, checked_in bool default false,
         stripe_checkout_id unique, stripe_payment_intent, created_at)

booking_lines(booking_id fk, ticket_type_id fk, qty int check (>0), unit_price_cents int,
              takes_seat bool)   -- valores congelados

booking_events(id, booking_id fk, at timestamptz, actor, text)   -- historial
```

Vista `session_availability`: aforo, plazas ocupadas (confirmadas + bloqueos vigentes con `takes_seat`), plazas libres y pasajeros.

## Flujos críticos

**Reserva web**
1. `create_booking_hold` con `FOR UPDATE` crea la reserva `pending` (bloqueo de 35 min).
2. Stripe Checkout caduca a los 31 min.
3. El webhook `checkout.session.completed` llama a `confirm_booking_payment` (idempotente) y se envía el email.
4. La página de éxito verifica también contra Stripe, por si el webhook se retrasa.

**Reserva interna**: misma función SQL sin bloqueo temporal (`confirmed` directo) y pago según el método elegido.

**Asignación de recursos**: función `auto_assign(session_id)` al confirmar la primera reserva. La exclusión de solapes también está garantizada en BD.

**Alta del equipo (Ajustes > Usuarios)**: el admin invita con nombre, email y rol. El servidor crea la cuenta pendiente con `auth.admin.generateLink({ type: 'invite' })` (service role, tras comprobar que es admin) y la fila de `staff` con la sesión del admin (RLS). No se envía email: el panel muestra un enlace `/invitacion?token=…` que el admin comparte. Al abrirlo, la persona escribe su contraseña dos veces y el servidor gasta el token (`verifyOtp`) y la guarda (`updateUser`). Dar de baja borra la fila de `staff` (el trigger protege al último admin) y luego la cuenta de Auth.

**Editor de productos**: el panel envía el producto entero (datos, precios y reglas) a una Server Action que lo valida con Zod contra los idiomas y tipos de entrada de la BD y llama a `save_product`, que lo crea o actualiza en una sola transacción (precios y reglas se sustituyen enteros; el slug se fija al crear y no cambia). La foto se sube desde el navegador al bucket público `product-photos` de Storage (solo el equipo puede subir o borrar, solo JPG/PNG/WebP de hasta 5 MB) con un nombre aleatorio; el producto guarda la ruta y, al sustituirla, el servidor borra la anterior. La vista previa de salidas usa la misma lógica de reglas (`previewSessions`) que tendrá `generate_sessions`.

**Generar salidas** (`generate_sessions(p_from, p_to, p_product_id?)`, idempotente): crea las salidas futuras de los productos activos que piden las reglas, con el aforo del producto. En las abiertas que siguen en las reglas actualiza idioma, hora de fin y aforo, y borra las abiertas futuras que ya no piden (regla cambiada o producto desactivado). Las cerradas o canceladas no se tocan. Si el aforo de una salida se cambia a mano, hay que marcar `capacity_custom = true` y ya no sigue al del producto. Un cerrojo (`pg_advisory_xact_lock`) evita que el cron y un guardado del panel se pisen. Si dos reglas piden la misma hora, gana la primera del editor (`save_product` guarda el orden en `created_at`). Además del cron, el panel la llama para un producto al guardarlo o al cambiar «A la venta». `sessions` no tiene FK a `schedule_rules`: guardar un producto sustituye sus reglas sin tocar las salidas. Pendiente (1.6): no borrar ni cambiar salidas con reservas (bloquearlas con `for update` antes de comprobarlo), `bookings.session_id` con `on delete restrict` y no permitir borrar productos con reservas. Las reglas guardadas antes de la 1.4 tienen el mismo `created_at`: si dos coinciden, el desempate es arbitrario hasta que se vuelva a guardar el producto.

**Calendario** (`/panel/calendario`): lee `sessions` del rango visible (semana de lunes a domingo, o el mes en semanas completas) convertido a instantes con la hora de Canarias. El estado va en la URL (`?vista=mes&fecha=2026-10-14&producto=<id>`) para poder recargar y compartir; la lógica está en `lib/domain/calendar.ts`. La ocupación muestra plazas vendidas / aforo sin contar las canceladas; hasta que existan las reservas (1.6) las vendidas son 0. Pulsar un día del mes abre su semana (en el prototipo abre Hoy, que llega en la 1.8) y las tarjetas de la semana abrirán el manifiesto (1.9). El seed genera las salidas de los próximos 120 días para desarrollo y e2e.

**Zonas horarias**: las reglas guardan hora local. `generate_sessions` construye `(date + time) at time zone` con la zona de Ajustes (`Atlantic/Canary`); en TypeScript lo mismo es `localToInstant` (`@date-fns/tz`). Tests en marzo y octubre.

## Decisiones

| Decisión | Motivo |
|---|---|
| Salidas materializadas (no virtuales) | Permite aforo y estado por salida, FK desde reservas e índices rápidos. |
| Funciones SQL para operaciones atómicas | Garantía de no-overbooking bajo concurrencia. |
| Stripe Checkout (no Elements) | Menos superficie PCI y 3DS resuelto. |
| Invitaciones con enlace para compartir (sin email) | Funciona sin configurar SMTP en Supabase. Cuando llegue Resend (2.3) se podrá enviar además por email. |
| Borrar un tipo de entrada borra sus precios | Como en el prototipo: deja de venderse en todos los productos. Las reservas (1.6) lo impedirán con `restrict`. |
| Fotos subidas desde el navegador a Storage | No pasan por el servidor de Vercel (límite de tamaño de las Server Actions). Una foto subida y descartada sin guardar puede quedar huérfana en el bucket. |
| Un solo negocio | Simplicidad. Multi-tenant posible más adelante añadiendo `org_id` y RLS. |
