---
name: dominio-reservas
description: Reglas de negocio del sistema de reservas de tours (salidas generadas por reglas de horario, aforo, tipos de entrada, bloqueos de plaza, mínimos, cierre de venta, cancelaciones, asignación de guías y vehículos). Usar siempre que se toque disponibilidad, reservas, precios, calendario, manifiesto o recursos.
---

# Dominio: reservas de tours

## Conceptos

- **Producto (tour)**: nombre, duración (min), aforo por salida, mínimo de participantes, punto de encuentro, zona del recorrido, si ofrece recogida en hotel, tipos de entrada que vende con su precio, recursos que necesita por salida.
- **Regla de horario**: días de la semana (ISO, 1=lunes) + horas de salida + idioma + temporada opcional (`valid_from`, `valid_to`). Un producto tiene varias reglas.
- **Salida (session)**: una ocurrencia concreta producto + fecha + hora + idioma. Se **materializa** en BD a partir de las reglas (job diario que genera los próximos 120 días, idempotente por `unique(product_id, starts_at)`). Puede tener aforo propio distinto al del producto y estado `open | closed | cancelled`.
- **Tipo de entrada**: adulto, niño, bebé, residente… Configurables a nivel negocio. Campo `takes_seat`: si es `false` (bebé en brazos) no resta aforo pero sí cuenta como pasajero.
- **Reserva**: pertenece a una salida. Líneas por tipo de entrada con cantidad y precio unitario **congelado** en el momento de reservar. Estado `pending | confirmed | cancelled`. Estado de pago `paid | pending | refunded | invoice` (agencia).
- **Recurso**: guía (con idiomas), vehículo (con asientos) o equipo. Se asignan a salidas.

## Reglas

1. **Plazas ocupadas** = suma de cantidades con `takes_seat = true` de reservas `confirmed` + reservas `pending` con bloqueo vigente (`hold_expires_at > now()`).
2. **Plazas libres** = aforo de la salida − plazas ocupadas. Nunca negativo: si se intenta, error.
3. **Bloqueo de plaza (web)**: al iniciar el pago se crea la reserva `pending` con `hold_expires_at = now() + 35 min` dentro de una función SQL con `FOR UPDATE` sobre la salida. Stripe Checkout caduca a los 31 min. Si el pago no llega, la plaza se libera sola.
4. **Cierre de venta online**: la web no ofrece salidas que empiecen antes de `now() + cutoff_hours`. El panel interno sí puede reservar hasta la hora de salida.
5. **Mínimo**: si una salida con reservas no llega al mínimo, se avisa en el panel (48 h antes). Nunca se cancela sola sin acción humana.
6. **Cancelación por el cliente**: gratuita hasta `cancel_hours` antes. Si estaba pagada, reembolso por Stripe y `refunded`.
7. **Cancelar una salida** cancela todas sus reservas y reembolsa las pagadas (con confirmación explícita en la UI).
8. **Cambio de fecha**: solo a otra salida del mismo producto con plazas suficientes. Precio congelado. Queda en el historial.
9. **Asignación automática de recursos** (al entrar la primera reserva de una salida):
   - Guías: solo los que hablan el idioma de la salida.
   - Ningún recurso en dos salidas cuyos intervalos `[inicio, inicio + duración)` se solapen.
   - Vehículos: el más pequeño con asientos ≥ aforo; si no hay, el más grande y aviso.
   - Si falta alguno, la salida queda marcada "sin equipo" y aparece en avisos.
10. **Dónde está cada recurso**: se deduce de la salida asignada en curso (zona del recorrido). El GPS real es un módulo aparte, no lo asumas.

## Dinero y fechas

- Céntimos `integer`. Total = Σ(cantidad × precio unitario congelado).
- `timestamptz` en BD. Al generar salidas, la hora local se convierte con `Atlantic/Canary`, con cuidado en los cambios de horario de verano e invierno (usa `@date-fns/tz`, nunca sumes offsets a mano).

## Dónde va el código

Funciones puras en `src/lib/domain/` (`availability.ts`, `pricing.ts`, `schedule.ts`, `assignment.ts`) con tests en Vitest que cubran los casos límite: última plaza, entradas sin plaza, bloqueos caducados, solapes, cambio de hora en marzo y octubre.
