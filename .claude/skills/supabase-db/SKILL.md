---
name: supabase-db
description: Cómo trabajar con la base de datos Supabase/Postgres del proyecto - crear migraciones, políticas RLS, funciones SQL transaccionales, tipos generados y acceso desde Next.js. Usar al crear o cambiar tablas, consultas, funciones SQL o permisos.
---

# Supabase y base de datos

## Flujo de cambios de esquema

1. `npx supabase migration new <nombre_descriptivo>`
2. Escribe SQL idempotente cuando sea posible (`create … if not exists`).
3. `npx supabase db reset` en local para aplicar desde cero y comprobar que todo funciona.
4. Regenera los tipos: `npx supabase gen types typescript --local > src/lib/database.types.ts`
5. Nunca edites una migración ya mergeada en `main`: crea otra nueva.
6. Producción se migra solo desde CI o a mano por una persona. Nunca lo hagas tú contra producción.

## RLS (obligatorio)

- `alter table <t> enable row level security;` en **cada** tabla nueva, en la misma migración.
- Panel interno: políticas para el rol `authenticated` limitadas a miembros del equipo (tabla `staff` con `user_id`).
- Web pública: **sin** acceso directo a tablas. Todo pasa por route handlers o server actions que usan el cliente de servidor, o por funciones `security definer` con `search_path` fijado y permisos `revoke all … from public; grant execute … to anon` solo donde haga falta.
- Escribe un test que compruebe que `anon` no puede leer `bookings` ni `customers`.

## Funciones transaccionales

Lo que deba ser atómico va en una función SQL:
- `create_booking_hold(session_id, lines jsonb, customer jsonb, hold_minutes int)` → bloquea la salida con `select … for update`, calcula plazas libres, valida, inserta reserva y líneas con precios del producto, y devuelve la reserva.
- `confirm_booking_payment(booking_id, payment_intent text)` → idempotente: solo cambia `pending → confirmed`.
- `generate_sessions(from date, to date)` → materializa salidas desde las reglas con `on conflict do nothing`.

## Acceso desde Next.js

- `src/lib/db/server.ts`: cliente con cookies (`@supabase/ssr`) para el panel, respeta RLS.
- `src/lib/db/admin.ts`: cliente con service role, importado **solo** desde código de servidor. Añade `import 'server-only'` al principio.
- Tipos siempre desde `database.types.ts`. Nada de `any`.

## Convenciones

- Tablas en inglés y plural snake_case (`sessions`, `booking_lines`). PK `uuid default gen_random_uuid()`.
- `created_at timestamptz default now()` en todas.
- Dinero `integer` en céntimos con `check (x >= 0)`. Estados con `check (status in (…))`.
- Índices para las consultas del panel: `sessions(starts_at)`, `bookings(session_id, status)`.
