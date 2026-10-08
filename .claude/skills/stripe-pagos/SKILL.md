---
name: stripe-pagos
description: Integración de pagos con Stripe - Checkout Sessions, webhooks firmados, idempotencia, reembolsos y modo test. Usar al tocar cobros, reembolsos, el webhook de Stripe o cualquier importe que se cobre al cliente.
---

# Pagos con Stripe

## Flujo de reserva web

1. Server action recibe salida + entradas + datos del cliente y valida con Zod.
2. Llama a `create_booking_hold` (ver skill `supabase-db`). El precio sale de la BD, nunca del cliente.
3. Crea `stripe.checkout.sessions.create` con:
   - `mode: 'payment'`, `currency: 'eur'`, `line_items` con `price_data` por tipo de entrada.
   - `metadata.booking_id` y `payment_intent_data.metadata.booking_id`.
   - `expires_at`: ahora + 31 min (el bloqueo dura 35).
   - `success_url` → `/reserva/{booking_id}?cs={CHECKOUT_SESSION_ID}` y `cancel_url` → libera el bloqueo.
   - Clave de idempotencia: `booking_id`.
4. Si falla Stripe, cancela el bloqueo y devuelve el error al usuario.

## Webhook `src/app/api/stripe/webhook/route.ts`

- Lee el cuerpo **crudo** (`await req.text()`) y verifica con `stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET)`. Si falla, responde 400.
- Eventos:
  - `checkout.session.completed` con `payment_status === 'paid'` → `confirm_booking_payment` + email de confirmación (solo si la función cambió el estado, para no duplicar emails).
  - `checkout.session.expired` → marca la reserva como caducada.
  - `charge.refunded` → `refunded`.
- Todo idempotente: Stripe puede reenviar el mismo evento varias veces.
- Responde 200 rápido. Lo pesado, en segundo plano o con reintentos.

## Página de éxito

No confíes en que el webhook haya llegado: si la reserva sigue `pending`, consulta la Checkout Session a Stripe y confirma con la misma función idempotente.

## Reembolsos

`stripe.refunds.create({ payment_intent })` desde servidor, con idempotency key `refund-<booking_id>`. Guarda el estado y anótalo en el historial de la reserva.

## Pruebas

- Siempre en modo test (`sk_test_…`). Para el webhook en local: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
- Tarjetas de prueba: 4242 4242 4242 4242 (ok), 4000 0000 0000 9995 (fondos insuficientes), 4000 0025 0000 3155 (requiere 3DS).
- Test e2e del flujo completo con Playwright en modo test.
