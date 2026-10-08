---
name: diseno-ui
description: Sistema visual y patrones de interfaz del proyecto (estilo Apple, claro, Tailwind + shadcn/ui), basado en prototype/index.html. Usar al crear o modificar cualquier pantalla, componente, formulario o vista móvil del panel o de la web de reservas.
---

# Diseño de interfaz

Referencia visual: `prototype/index.html`. Antes de construir una pantalla, localiza su equivalente en el prototipo y replica estructura, jerarquía y textos.

## Tokens (añádelos a `tailwind` y a las variables CSS de shadcn)

| Token | Valor | Uso |
|---|---|---|
| bg | `#F5F5F7` | fondo de la app |
| surface | `#FFFFFF` | tarjetas, tablas |
| ink | `#1D1D1F` | texto principal |
| muted | `#6E6E73` | texto secundario |
| faint | `#86868B` | metadatos |
| line | `#E3E3E8` | bordes |
| accent | `#0071E3` | acción principal, enlaces |
| ok / warn / danger | `#248A3D` / `#B25000` / `#D70015` | estados |

- Tipografía: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Geist", system-ui`. Cifras con `tabular-nums`; horas y códigos en monoespaciada.
- Radios: botones en píldora (`rounded-full`), tarjetas `rounded-2xl`, inputs `rounded-[10px]`.
- Sombras muy suaves: `0 1px 3px rgb(0 0 0/.04), 0 4px 14px rgb(0 0 0/.03)`.
- Barra superior blanca translúcida con `backdrop-blur`. Solo modo claro: fuerza `color-scheme: light` y da color explícito a todo texto (el modo oscuro del sistema no debe colarse).

## Patrones

- **Estados con pastillas** (`Pagado`, `Pendiente`, `Sin equipo`, `Bajo mínimo`), nunca solo con color.
- **Resumen antes que detalle**: KPIs arriba y listas debajo.
- **Paneles laterales** (sheet) para fichas, y **modales** para acciones cortas (nueva reserva, cobrar).
- Confirmación propia en la UI para acciones destructivas: cancelar salida o reserva, eliminar.
- Feedback con toast tras cada acción ("Reserva VT1234 creada").
- No recargar ni redibujar pantallas enteras: actualizaciones optimistas o `revalidatePath` y mantener el scroll.

## Responsive (obligatorio)

- Diseña primero para 390 px y luego escala.
- Móvil: barra de pestañas inferior (Hoy, Calendario, +, Reservas, Más), tablas que se convierten en tarjetas y modales a pantalla completa.
- Tablet: navegación en segunda fila con scroll horizontal.
- Verifica cada pantalla con Playwright en 390×844 y 1440×900 antes de darla por terminada.

## Accesibilidad

Foco visible, `aria-label` en botones de icono, contraste AA y objetivos táctiles de 44 px como mínimo en móvil.
