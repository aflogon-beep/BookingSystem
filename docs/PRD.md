# PRD — Ruta Reservas

## Problema

Una empresa de tours guiados en Tenerife (3-10 tours, 3-15 guías, varios idiomas) necesita vender online, gestionar reservas de teléfono, mostrador y agencias, y operar cada día (quién va, cuánto se ha cobrado, qué guía y vehículo lleva cada salida) sin depender de un SaaS de terceros.

## Usuarios

| Rol | Necesita |
|---|---|
| **Cliente** (turista) | Ver tours, elegir fecha, hora e idioma, pagar con tarjeta desde el móvil, recibir confirmación. |
| **Oficina** | Reservar por teléfono en segundos, cobrar pendientes, cambiar fechas, cancelar con reembolso, ver el día. |
| **Guía** | Manifiesto de su salida en el móvil, check-in y pasajeros con recogida en hotel. |
| **Dirección** | Ocupación, ingresos, canales y avisos. |

## Alcance v1

**Web pública**
- Listado de experiencias con foto, duración, idiomas y precio desde.
- Ficha de tour con calendario de disponibilidad (precio por día), horarios con plazas libres y selector de entradas.
- Checkout con Stripe, hotel de recogida opcional y confirmación con código.
- Email de confirmación y recordatorio 24 h antes.
- Cierre de venta X horas antes. Cancelación gratuita hasta Y horas antes.
- Multidioma de interfaz: ES y EN (DE en v1.1).

**Panel interno** (pantallas en `prototype/index.html`)
- **Hoy**: KPIs del día, salidas con ocupación y equipo, avisos 48 h y actividad reciente.
- **Calendario**: semana (por defecto) y mes con mapa de calor de ocupación.
- **Manifiesto**: pasajeros, check-in, cobrar pendientes, avisar a todos, estado y aforo de la salida, asignación de equipo.
- **Nueva reserva**: producto, fecha, salida, entradas, cliente, canal (teléfono, mostrador, agencia) y pago (TPV, efectivo, enlace de pago, paga allí, factura a agencia).
- **Reservas**: pestañas (próximas, hoy, pago pendiente, pasadas, canceladas), búsqueda, filtros y CSV.
- **Ficha de reserva**: cambiar de fecha, cobrar, check-in, notas internas, reenviar confirmación, cancelar con reembolso e historial.
- **Clientes**: agrupados por email, recurrencia y gasto.
- **Productos**: editor por pestañas (general, precios, horarios, equipo), vista previa de las salidas generadas y foto.
- **Equipo**: "Dónde están" (línea de tiempo del día con estado de cada recurso) y fichas con planificación semanal.
- **Informes**: ingresos por día, por producto, por canal y por idioma, más ocupación.
- **Ajustes**: empresa, idiomas, tipos de entrada, políticas y Stripe.
- Asistente de configuración inicial y tour guiado.

**Acceso**: login por email para el equipo. Roles: `admin` (todo) y `staff` (operar, sin ajustes ni informes de ingresos). Guía en v1.1.

## Fuera de alcance v1

OTAs y channel manager, facturación Verifactu (se usará un software de facturación externo), multi-empresa, GPS en tiempo real, app nativa, cupones y tarjetas regalo (v1.2).

## Requisitos no funcionales

- **Fiabilidad**: cero overbooking (control transaccional), pagos idempotentes y copias diarias de la BD.
- **Rendimiento**: web pública LCP < 2,5 s en 4G y panel con respuestas < 300 ms.
- **Seguridad**: RLS en todas las tablas, secretos solo en servidor, revisión externa antes de producción.
- **Responsive**: todo usable en un móvil de 390 px.
- **RGPD**: política de privacidad, datos mínimos y borrado a petición.

## Métricas de éxito

- 100 % de reservas web sin intervención manual.
- Reserva telefónica en menos de 30 s.
- 0 incidencias de overbooking o cobros duplicados.
