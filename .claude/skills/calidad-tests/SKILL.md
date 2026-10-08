---
name: calidad-tests
description: Estrategia de pruebas y definición de terminado del proyecto - qué cubrir con Vitest y Playwright, datos de prueba y comprobaciones antes de cerrar una tarea o abrir un PR. Usar al escribir tests, al terminar una funcionalidad o al revisar si algo está listo.
---

# Calidad y pruebas

## Definición de terminado

Una tarea está terminada solo si:
1. `npm run lint && npm run typecheck && npm run test` pasan en verde.
2. Hay tests nuevos para la lógica añadida (y uno que reproduzca el bug, si es un fix).
3. Si cambia una pantalla: test e2e del flujo principal y captura en móvil (390×844) y escritorio (1440×900).
4. Si cambia el esquema: migración nueva, `supabase db reset` OK y tipos regenerados.
5. `docs/ROADMAP.md` actualizado.

## Unitarios (Vitest) — obligatorios en `src/lib/domain/`

Casos mínimos:
- Disponibilidad: última plaza, sobreventa por una plaza, entradas sin plaza, bloqueo vigente frente a caducado, salida cerrada o cancelada.
- Generación de salidas: reglas con temporada, varios horarios, duplicados, cambio de hora de marzo y octubre en `Atlantic/Canary`.
- Precios: totales en céntimos, precio congelado tras cambiar la tarifa.
- Asignación: idioma del guía, solapes, vehículo pequeño frente a grande, recurso inexistente.

## Concurrencia

Test de integración contra Supabase local: 20 intentos simultáneos de reservar las 2 últimas plazas → exactamente las que caben confirmadas y el resto rechazadas.

## End-to-end (Playwright)

Flujos críticos, en móvil y escritorio:
1. Cliente reserva y paga en la web (Stripe test) → aparece en el panel.
2. Reserva por teléfono desde el panel con pago pendiente → cobrar en el manifiesto.
3. Check-in en el manifiesto.
4. Cancelar una reserva pagada → reembolso.
5. Crear producto con reglas → aparecen sus salidas en el calendario.

## Datos de prueba

`supabase/seed.sql` con la empresa de ejemplo del prototipo (3 tours, 4 guías, 3 vehículos). Nunca datos reales de clientes en tests ni en capturas.
