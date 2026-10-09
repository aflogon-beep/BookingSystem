# Ruta Reservas

Sistema de reservas y operaciones para una empresa de tours guiados en Tenerife (un solo negocio, no multi-tenant). Inspirado en FareHarbor y Bokun. Sin integración con OTAs ni facturación Verifactu en esta fase.

El prototipo funcional de referencia está en `prototype/index.html`: ábrelo para ver pantallas, flujos y estilo visual antes de construir cualquier pantalla. Es la fuente de verdad del diseño y del comportamiento esperado, **no** de la arquitectura (es un HTML con localStorage).

Documentación del proyecto:
- `docs/PRD.md` — qué hace el producto y para quién.
- `docs/ARCHITECTURE.md` — modelo de datos, flujos críticos y decisiones técnicas.
- `docs/ROADMAP.md` — fases y tareas. Marca las casillas al terminar cada tarea.

## Stack

- Next.js 16 (App Router) + TypeScript estricto + React Server Components. Esta versión cambia APIs respecto a versiones anteriores: consulta `AGENTS.md` y la documentación en `node_modules/next/dist/docs/` antes de escribir código de Next.
- Tailwind CSS + shadcn/ui. Iconos: lucide-react.
- Supabase: Postgres, Auth (equipo interno), Storage (fotos de productos).
- Stripe Checkout + webhooks para pagos online.
- Resend para emails transaccionales.
- Zod para validar toda entrada externa. date-fns + @date-fns/tz para fechas.
- Vitest (unitarios) + Playwright (end-to-end).
- Despliegue en Vercel. Zona horaria del negocio: `Atlantic/Canary`.

## Comandos

```bash
npm run dev          # desarrollo local
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # Vitest
npm run test:e2e     # Playwright (necesita Supabase local en marcha)
npm run test:db      # tests de RLS y SQL contra Supabase local
npm run build        # build de producción
npx supabase start   # Supabase local (Docker)
npx supabase migration new <nombre>
npx supabase gen types typescript --local > src/lib/database.types.ts   # = npm run db:types
npm run staff:create -- --email … --name … --role admin   # alta en el equipo
npm run staff:password -- --email …                       # cambiar contraseña
```

## Estructura

```
src/
  app/(public)/        web de reservas para clientes
  app/(panel)/         backoffice del equipo (requiere login)
  app/api/             route handlers (webhooks de Stripe, etc.)
  components/ui/       shadcn/ui
  components/          componentes propios
  lib/domain/          lógica de negocio pura y testeable (disponibilidad, precios, asignación)
  lib/db/              acceso a datos (Supabase)
  lib/stripe/, lib/email/
supabase/migrations/   SQL versionado
tests/e2e/             Playwright
```

## Reglas no negociables

1. **Seguridad**
   - Row Level Security activado en **todas** las tablas. Sin excepciones.
   - La `SUPABASE_SERVICE_ROLE_KEY` y la `STRIPE_SECRET_KEY` solo se usan en servidor. Nunca en componentes cliente ni en variables `NEXT_PUBLIC_*`.
   - Nunca confíes en precios, aforos ni totales que vengan del cliente: recalcula siempre en servidor.
   - Verifica la firma de todos los webhooks de Stripe.
   - No leas ni modifiques archivos `.env*` salvo `.env.example`.
2. **Integridad de reservas**
   - La comprobación de plazas y la creación de la reserva ocurren en una única función SQL con bloqueo de fila (`SELECT … FOR UPDATE`). Nunca en dos pasos desde la app.
   - Importes siempre en céntimos (`integer`). Nunca `float`.
   - Fechas en BD como `timestamptz`. Se muestran en `Atlantic/Canary`.
3. **Calidad**
   - Toda lógica de negocio va en `src/lib/domain/` como funciones puras con tests.
   - Antes de dar una tarea por terminada: `npm run lint && npm run typecheck && npm run test` en verde.
   - Cambios de esquema solo mediante migraciones nuevas. Nunca edites una migración ya aplicada.

## Forma de trabajar

- Antes de una tarea grande, propón un plan breve y espera confirmación.
- Trabaja en ramas (`feat/…`, `fix/…`) y abre PR. No hagas push directo a `main`.
- Commits pequeños en español, en imperativo: "Añade generador de salidas".
- Si una decisión no está en estos documentos, pregunta antes de inventarla.
- Interfaz y textos en español de España. El código (variables, funciones) en inglés.

## Skills del proyecto

Están en `.claude/skills/` y se cargan solas cuando aplican:
- `dominio-reservas` — reglas de negocio (salidas, aforos, entradas, recursos).
- `supabase-db` — migraciones, RLS y tipos.
- `stripe-pagos` — checkout, webhooks y reembolsos.
- `diseno-ui` — sistema visual estilo Apple del prototipo.
- `calidad-tests` — qué y cómo testear.
- `/revision-seguridad` y `/nueva-funcionalidad` — se lanzan a mano.
