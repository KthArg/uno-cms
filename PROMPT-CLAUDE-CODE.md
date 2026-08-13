# PROMPT PARA CLAUDE CODE — Construcción del MVP de UnoCMS vía Spec-Driven Development

> Copia todo lo que sigue como primer mensaje en Claude Code, ejecutado dentro de un directorio vacío con `git` y `gh` (GitHub CLI) autenticados. El archivo `SPEC.md` debe estar en el directorio (o pégalo como contexto adicional).

---

Vas a construir el MVP de **UnoCMS** siguiendo estrictamente `SPEC.md` (la especificación adjunta es la fuente de verdad; ante ambigüedad, la spec gana sobre tu criterio, y ante silencio de la spec, decides tú y lo documentas en un ADR). Trabajarás como un equipo profesional de una sola persona: todo pasa por GitHub, con issues, ramas, PRs, revisiones y CI. Nada se mergea a `main` sin PR verde.

## Reglas de proceso (no negociables)

1. **Spec-driven:** antes de escribir código de una fase, produce/actualiza los documentos de esa fase (`docs/specs/NN-nombre.md`) derivados de SPEC.md: alcance exacto, contratos (tipos, schemas, actions afectadas), casos de prueba que definirán el "hecho". El código se escribe para satisfacer esos documentos, y los tests se escriben desde los casos del spec, no desde la implementación.
2. **GitHub flow completo:**
   - Crea el repo con `gh repo create uno-cms --private --clone=false` (usa el remoto actual si ya existe).
   - Protege `main`: `gh api` para exigir PR + status checks (`ci`) + conversación resuelta; prohibido push directo.
   - Cada fase = un **milestone**. Cada unidad de trabajo = un **issue** con criterios de aceptación checkeables, etiquetado (`feat`, `security`, `infra`, `docs`, `test`).
   - Una rama por issue: `feat/NN-descripcion`, `fix/...`, `chore/...`. Commits en Conventional Commits, atómicos.
   - Un PR por rama con el template del repo: qué/por qué, cómo probarlo, checklist de seguridad, screenshots si hay UI, `Closes #N`.
   - **Auto-revisión obligatoria:** tras abrir cada PR, cambia de rol a revisor exigente: relee el diff completo buscando fallos de seguridad (checklist §7 de SPEC.md), casos borde, y desviaciones de la spec. Deja los hallazgos como comentarios de review reales (`gh pr review --comment`), corrígelos en commits nuevos, y solo entonces aprueba y mergea con squash. Si un hallazgo es material, dilo explícitamente en el PR — no maquilles.
   - Después de cada merge, verifica CI en `main` antes de continuar.
3. **CI primero:** ningún feature se inicia hasta que el pipeline exista y falle/pase correctamente.
4. **TDD pragmático:** para `cms/core`, `cms/security` y todas las server actions, escribe primero los tests desde los casos del spec (incluidos payloads maliciosos: sin sesión, rol insuficiente, Zod inválido, `javascript:` en links, version conflict). UI puede ir test-after con e2e.
5. **Trazabilidad:** mantén `docs/DECISIONS.md` (ADRs cortos para toda decisión no cubierta por SPEC.md) y actualiza `docs/PROGRESS.md` al cerrar cada milestone (qué se hizo, qué quedó fuera, riesgos).
6. **Sin scope creep:** todo lo listado en SPEC.md §10 (fuera de alcance) queda como issues etiquetados `post-mvp`, sin código.
7. Si en algún punto detectas una contradicción interna en SPEC.md o una imposibilidad técnica real, no la resuelvas en silencio: abre un issue `spec-question`, propone la resolución en un ADR, adóptala y sigue.

## Fases / Milestones (orden estricto; no abras la siguiente con la anterior incompleta)

**M0 — Fundaciones e infraestructura** (issues: scaffold Next 15 + TS estricto + Tailwind; ESLint/Prettier/Husky; estructura de carpetas de SPEC §3; GitHub Actions con jobs lint→typecheck→unit→build y Postgres de servicio para integración; templates de PR/issue; branch protection; `.env.example`; `docs/PROGRESS.md`).
DoD: CI verde en un PR trivial; `main` protegida; `pnpm dev` levanta.

**M1 — Núcleo de datos y configuración** (Drizzle schema §4 + migraciones; cliente Neon; `defineConfig`/`s.*` con inferencia TS; `schema-gen` laxo/estricto; seed de singletons; tests unitarios de generación de schemas y de inferencia de tipos con `expectTypeOf`).
DoD: `cms.config.ts` de ejemplo produce Zod y tipos correctos; migraciones aplican en CI.

**M2 — Autenticación y seguridad base** (Auth.js credentials + Argon2; lockout y rate limit; middleware con guard `/admin` + headers/CSP §7.2; flujo `/setup` §7.3; `tokens.ts` HMAC; `audit.ts`; tests de integración: brute force bloqueado, setup de un solo uso, headers presentes).
DoD: imposible acceder a `/admin` sin sesión; checklist de amenazas §7.1 cubierto por al menos un test cada uno donde sea automatizable.

**M3 — API de contenido (server actions)** (todas las actions de SPEC §5.3 con el pipeline sesión→ratelimit→zod→tx→audit→revalidate; sanitización richtext; optimistic locking; revisiones con poda; tests de integración exhaustivos contra Postgres real, incluyendo `VERSION_CONFLICT`, `LAST_ADMIN`, `MEDIA_IN_USE`).
DoD: cobertura ≥ 80 % en `cms/core` y `cms/security`; todos los códigos de error del spec ejercitados.

**M4 — Panel de administración** (shell + login; dashboard de estados; generador de formularios campo→componente; editor con autosave/debounce y manejo de conflicto; media library con upload firmado a Blob; historial/restaurar; usuarios y settings; a11y básica: labels, focus, teclado).
DoD: e2e Playwright: login → editar → guardar → publicar → historial → restaurar.

**M5 — Landing de ejemplo + preview en vivo** (secciones demo Hero/About/Testimonials/FAQ con `useContent` y `data-cms-key`; `StaticContentProvider` + página pública con ISR por tags; `/preview` con token firmado; `PreviewFrame` + `PreviewProvider` con postMessage seguro §6; toggle móvil/escritorio; scroll-to-section).
DoD: e2e: teclear en el form cambia el iframe sin guardar; publicar actualiza la página pública; token inválido → 404; mensaje con origin ajeno se ignora (test unitario del listener).

**M6 — Endurecimiento, rendimiento y release** (Lighthouse CI con presupuestos §8; revisión de seguridad transversal como PR propio: recorre §7.1 ítem por ítem anotando evidencia en `docs/SECURITY.md`; `pnpm audit` en CI; pulido de mensajes de error del panel en español llano; `docs/SETUP.md` y `docs/DEVELOPER.md` completos; Deploy Button en README; tag `v0.1.0` con `gh release create` y changelog generado desde los PRs).
DoD: los 6 criterios de SPEC §11 verificados y documentados en `docs/PROGRESS.md`.

## Formato de trabajo por issue

Para cada issue: (1) lee su spec de fase, (2) escribe los tests que definen el criterio de aceptación, (3) implementa hasta verde local, (4) abre PR, (5) auto-review con rol de revisor, (6) corrige, (7) merge squash, (8) marca el issue. Reporta al final de cada milestone un resumen honesto: qué funciona, qué es frágil, qué probarías manualmente.

Empieza ahora por M0. Primero muéstrame el plan de issues de M0 (títulos + criterios de aceptación) y créalos en GitHub antes de escribir código.
