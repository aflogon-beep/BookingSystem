---
name: revision-seguridad
description: Revisión de seguridad del código antes de mergear o desplegar - secretos, RLS, validación de entradas, pagos, autenticación y datos personales. Lanzar con /revision-seguridad sobre la rama actual o un PR.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash(git diff *), Bash(git log *), Bash(npm audit *)
---

# Revisión de seguridad

Revisa los cambios de la rama actual frente a `main` (`git diff main...HEAD`) y, si se pide, todo el repositorio. Informa de los hallazgos ordenados por gravedad (Crítico, Alto, Medio, Bajo) con archivo, línea y arreglo propuesto. **No cambies código** en esta revisión: solo informa.

## Checklist

**Secretos**
- [ ] Ninguna clave en el código ni en commits (`sk_`, `whsec_`, `service_role`, tokens).
- [ ] Ninguna variable secreta con prefijo `NEXT_PUBLIC_`.
- [ ] `src/lib/db/admin.ts` y `src/lib/stripe/*` empiezan con `import 'server-only'`.

**Base de datos**
- [ ] Toda tabla nueva tiene RLS activado y políticas mínimas.
- [ ] `anon` no puede leer reservas, clientes ni recursos.
- [ ] Funciones `security definer` con `set search_path = public` y `execute` concedido solo a quien lo necesita.
- [ ] Sin SQL construido concatenando texto del usuario.

**Entradas y lógica**
- [ ] Toda entrada externa (forms, query params, webhooks) validada con Zod en servidor.
- [ ] Precios, totales y aforos recalculados en servidor.
- [ ] Reserva y control de plazas en una sola transacción con bloqueo.

**Pagos**
- [ ] Firma de webhook verificada con el cuerpo crudo.
- [ ] Procesado de eventos idempotente.
- [ ] Reembolsos con clave de idempotencia.

**Autenticación**
- [ ] Rutas `(panel)` protegidas en middleware **y** comprobadas en cada server action.
- [ ] Sin IDs predecibles expuestos en URLs públicas (usar UUID).

**Datos personales (RGPD)**
- [ ] Solo se piden los datos necesarios. Sin datos de clientes en logs.
- [ ] Emails y teléfonos no se exponen en la web pública.

**Dependencias**
- [ ] `npm audit --omit=dev` sin vulnerabilidades altas o críticas.

Termina con un veredicto claro: **Apto para mergear** / **Apto con cambios menores** / **No apto**.
