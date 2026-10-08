# Primeros pasos con Claude Code

Guía para arrancar el proyecto desde cero. Tiempo estimado: 45-60 minutos la primera vez.

## 1. Requisitos en tu ordenador
- **Node.js 22 LTS** (nodejs.org).
- **Git** y una cuenta de **GitHub**.
- **Docker Desktop** (para Supabase en local).
- **Claude Code**: sigue la instalación oficial en https://code.claude.com/docs/en/overview y entra con tu cuenta de Claude.

## 2. Cuentas (todas tienen plan gratuito para empezar)
- **Supabase** (supabase.com): crea un proyecto llamado `ruta-reservas` en la región de la UE.
- **Stripe** (stripe.com): quédate en **modo test**. Copia la clave `sk_test_…`.
- **Vercel** (vercel.com): entra con GitHub.
- **Resend** (resend.com): opcional hasta la fase 2.

## 3. Crear el repositorio
1. En GitHub crea un repo **privado** vacío: `ruta-reservas`.
2. Descomprime este kit en una carpeta y súbelo:
   ```bash
   cd ruta-reservas
   git init && git add . && git commit -m "Kit inicial del proyecto"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/ruta-reservas.git
   git push -u origin main
   ```
3. Copia `.env.example` a `.env.local` y rellénalo cuando Claude te lo pida. **Nunca subas `.env.local`** (ya está en `.gitignore`).
4. En GitHub → Settings → Branches, protege `main`: exige PR y que pase el CI.

## 4. Abrir Claude Code
```bash
cd ruta-reservas
claude
```
Claude Code lee `CLAUDE.md` y carga las skills de `.claude/skills/` automáticamente. Para comprobarlo, escribe `/` y verás `/nueva-funcionalidad` y `/revision-seguridad`.

Opcional: integra Claude con GitHub para poder mencionar a `@claude` en issues y PRs. Dentro de Claude Code escribe `/install-github-app` y sigue los pasos.

## 5. Primeros prompts (cópialos tal cual)

**Arranque:**
> Lee CLAUDE.md, docs/PRD.md, docs/ARCHITECTURE.md y docs/ROADMAP.md, y abre prototype/index.html. Resúmeme en 10 líneas qué vamos a construir y dime si ves alguna contradicción o duda antes de empezar.

**Primera tarea:**
> /nueva-funcionalidad 0.1

Después ve tarea a tarea: `/nueva-funcionalidad 0.2`, `0.3`… Revisa cada plan antes de aprobarlo y cada PR antes de mergear.

**Antes de cada merge importante:**
> /revision-seguridad

## 6. Buenas prácticas
- **Una tarea por sesión.** Al terminar, `/clear` para empezar limpio la siguiente.
- **Lee los planes.** Es el mejor momento para corregir el rumbo.
- **Prueba tú mismo** cada PR en la preview que Vercel genera automáticamente.
- **Si algo se repite**, pídele a Claude que lo añada a `CLAUDE.md` o a la skill que toque, para que no vuelva a pasar.
- **Nunca pegues claves** en el chat. Van solo en `.env.local` y en Vercel.

## 7. Antes de cobrar a clientes reales
Fase 4 del roadmap completa, revisión externa de seguridad, textos legales y 2 semanas de piloto en modo test con el equipo.
