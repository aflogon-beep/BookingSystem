---
name: nueva-funcionalidad
description: Flujo completo para construir una tarea del roadmap - plan, rama, tests, implementación, verificación y PR. Lanzar con /nueva-funcionalidad seguido de la tarea, por ejemplo "/nueva-funcionalidad 1.3 generador de salidas".
disable-model-invocation: true
argument-hint: "[nº de tarea o descripción]"
---

# Nueva funcionalidad

Tarea: $ARGUMENTS

Sigue estos pasos en orden y no te saltes ninguno:

1. **Entender.** Lee la tarea en `docs/ROADMAP.md`, las secciones relacionadas de `docs/PRD.md` y `docs/ARCHITECTURE.md`, y su pantalla en `prototype/index.html` si la tiene.
2. **Plan.** Propón un plan corto: archivos a crear o cambiar, migraciones, tests y riesgos. **Espera mi confirmación** antes de seguir.
3. **Rama.** `git checkout -b feat/<nombre-corto>` desde `main` actualizado.
4. **Tests primero** para la lógica de dominio (skill `calidad-tests`).
5. **Implementar** en pasos pequeños, con un commit por paso lógico.
6. **Verificar**: `npm run lint && npm run typecheck && npm run test`. Si hay UI, e2e y capturas en 390 px y 1440 px.
7. **Autorevisión**: pasa el agente `revisor-codigo` sobre el diff y corrige lo que encuentre.
8. **Roadmap**: marca la tarea como hecha en `docs/ROADMAP.md`.
9. **PR**: haz push de la rama y abre el PR con la plantilla. Resume qué cambia, cómo probarlo y capturas.

Si algo de la tarea es ambiguo o choca con las reglas de `CLAUDE.md`, para y pregunta.
