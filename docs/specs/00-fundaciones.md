# 00 — Fundaciones e infraestructura (M0)

> Documento de fase derivado de `SPEC.md`. Fuente de verdad: `SPEC.md`.
> Secciones cubiertas: §2 (stack), §3 (estructura), §7.1 (secretos en cliente, dependencias,
> inyección SQL, XSS), §7.4 (env vars), §11.4 (suite verde en CI).
>
> Ante ambigüedad manda `SPEC.md`. Ante silencio de la spec, la decisión se toma aquí y
> queda registrada como ADR en [`../DECISIONS.md`](../DECISIONS.md).

---

## 1. Alcance

M0 entrega el esqueleto sobre el que se construye todo lo demás: un proyecto Next.js que
arranca, herramientas de calidad que fallan cuando deben fallar, una suite de tests que se
puede ejecutar, un pipeline de CI que es el guardián de `main`, y la documentación de
trazabilidad. **Ni una línea de lógica de CMS.**

Issues de la fase:

| Issue | Entrega |
|---|---|
| #1 | Este documento + ADRs iniciales |
| #2 | Scaffold Next 15 + React 19 + TS estricto + Tailwind 4 |
| #3 | Estructura de carpetas §3 + frontera `server-only` |
| #4 | ESLint + Prettier + Husky + lint-staged con reglas de seguridad |
| #5 | Vitest (unit/integration) + Playwright (e2e) |
| #6 | Pipeline de CI |
| #7 | Plantillas de PR/issue, Dependabot, CODEOWNERS |
| #8 | Protección de `main` |
| #9 | `.env.example`, DECISIONS, PROGRESS, esqueletos de `docs/` |

Orden de ejecución: **#1 → #2 → #4 → #5 → #6 → #8 → #3 → #7 → #9**.
La regla de proceso 3 ("CI primero") obliga a que #6 preceda a cualquier trabajo de
producto; #8 va después de #6 porque no se puede exigir un status check que todavía no
existe.

## 2. Fuera de alcance de M0

Se declaran explícitamente para evitar scope creep:

- Esquema de base de datos, migraciones y cliente Drizzle → **M1**.
- `cms.config.ts`, `defineConfig`, `s.*`, `schema-gen` → **M1**.
- Auth.js, Argon2, middleware, CSP, `/setup` → **M2**.
- Server actions y su pipeline → **M3**.
- Cualquier UI de panel o de landing → **M4**/**M5**.
- Lighthouse CI y presupuestos de rendimiento (§8) → **M6**.
- Todo lo de `SPEC.md` §10 → issues `post-mvp` (#10–#17), sin código.

M0 **sí** crea los directorios vacíos de esos módulos (#3) y **sí** deja el hueco de
`DATABASE_URL` en CI (#6), porque el coste de retrofit es mayor que el de anticiparlo.

## 3. Contratos

### 3.1 Versiones fijadas

`SPEC.md` §2 nombra mayores, no parches. Se fijan aquí los rangos exactos que el repo
usará durante todo el MVP. Cualquier salto de mayor requiere un ADR nuevo.

| Paquete | Versión | Origen |
|---|---|---|
| `next` | `15.5.x` | SPEC §2 ("Next.js 15") — ver ADR-100 |
| `react` / `react-dom` | `19.x` | SPEC §2 |
| `typescript` | `5.9.x` | ADR-101 |
| `tailwindcss` + `@tailwindcss/postcss` | `4.x` | SPEC §2 ("Tailwind CSS 4") |
| `zod` | `3.25.x` | SPEC §2 ("Zod v3") |
| `drizzle-orm` / `drizzle-kit` | `0.45.x` / `0.31.x` | SPEC §2 — se instalan en M1 |
| `next-auth` | `5.0.0-beta.x` | SPEC §2 ("Auth.js v5") — se instala en M2 |
| `@node-rs/argon2` | `2.x` | SPEC ADR-004 — M2 |
| `@neondatabase/serverless` | `1.x` | SPEC ADR-002 — M1 |
| `@vercel/blob` | `1.x` | SPEC ADR-005 — M4 |
| `vitest` + `@vitest/coverage-v8` | `3.2.x` | ADR-102 |
| `@playwright/test` | `1.62.x` | SPEC §2 |
| `eslint` | `9.x` | ADR-103 |
| `eslint-config-next` | igual que `next` | requisito del paquete |
| `prettier` | `3.x` | SPEC §2 |
| `husky` | `9.x` | SPEC §2 |
| `lint-staged` | `17.x` | SPEC §2 |
| `server-only` | `0.0.1` | SPEC §7.1 |

Gestor de paquetes: **pnpm**, fijado con el campo `packageManager` de `package.json`.
Node: **22.x** en local y en CI (`engines` + `actions/setup-node`).

### 3.2 Contrato de scripts (`package.json`)

Los nombres son estables: CI, hooks de git y esta documentación dependen de ellos.

| Script | Debe hacer | Debe fallar si |
|---|---|---|
| `dev` | `next dev` en el puerto 3000 | — |
| `build` | `next build` | error de compilación o de tipos |
| `start` | `next start` | — |
| `lint` | ESLint sobre todo el repo | cualquier error de lint |
| `typecheck` | `tsc --noEmit` | cualquier error de tipos |
| `test` | `test:unit` + `test:integration` | cualquier test rojo |
| `test:unit` | Vitest, proyecto `unit` | cualquier test rojo |
| `test:integration` | Vitest, proyecto `integration` | test rojo; **no** si no hay tests todavía |
| `test:e2e` | Playwright | cualquier test rojo |
| `format` | Prettier `--write` | — |
| `format:check` | Prettier `--check` | cualquier fichero sin formatear |

### 3.3 Estructura de carpetas

La de `SPEC.md` §3, literal. En M0 se crean todos los directorios; los que aún no tienen
contenido llevan un `README.md` de una línea que dice **qué hito los llena**. Prohibidos
los ficheros de código vacíos o de relleno.

Marca de hito por directorio:

```
app/(site)/          → M5      cms/core/       → M1 (config, schema-gen) + M3 (content)
app/preview/         → M5      cms/db/         → M1
app/admin/           → M4      cms/auth/       → M2
app/api/             → M2/M4   cms/security/   → M2 (tokens, ratelimit, audit) + M3 (sanitize)
app/setup/           → M2      cms/actions/    → M3
components/site/     → M5      cms/ui/         → M4
                               cms/preview/    → M4 (RichText) + M5 (provider, useContent)
```

`cms/preview/` es el único árbol de `cms/` **isomorfo**: contiene el contrato de contenido
del lado cliente (`useContent.ts`, `PreviewProvider.tsx`) y el renderizador `RichText`
(ADR-106). Por eso queda fuera de la lista de árboles con `server-only` de §3.5.

### 3.4 Contrato de CI

- Fichero: `.github/workflows/ci.yml`.
- Disparadores: `pull_request` (cualquier rama destino) y `push` a `main`.
- **El status check obligatorio se llama `ci`.** Es el nombre que la protección de rama
  (#8) exige. Se implementa como un job agregador que depende de los demás, para que la
  protección no tenga que enumerar cada job y no se rompa al añadir jobs nuevos.
- Orden de dependencias: `lint → typecheck → unit → build`, más `integration` (con
  servicio Postgres) y `audit` en paralelo. `ci` depende de todos.
- Servicio de integración: imagen `postgres:16`, `DATABASE_URL` expuesta al job.
- Caché del store de pnpm entre ejecuciones.
- `pnpm audit --audit-level=high` (SPEC §7.1). No bloqueante en M0 **solo** si hay ruido
  documentado en el PR; obligatorio bloqueante antes de M6 (SPEC §11.5).

### 3.5 Frontera servidor/cliente

SPEC §7.1 exige que `cms/core`, `cms/db`, `cms/auth` y `cms/security` nunca lleguen al
bundle de cliente, y que **CI falle** si ocurre. Contrato en dos capas:

1. **Estática (test unitario, #3):** todo `.ts` bajo esos cuatro árboles importa
   `server-only` en su primera sentencia. Excepción única: ficheros con un comentario
   `// isomorphic: <razón>` en la primera línea, que quedan exentos y **enumerados** en el
   propio test, de modo que añadir uno nuevo obliga a tocar el test.
2. **Dinámica (CI, #6):** el paquete `server-only` **rompe la build** en cuanto un módulo
   que lo importa pasa a ser alcanzable desde el grafo de cliente, de forma directa o
   indirecta — es su único propósito. El guard dinámico es, por tanto, `pnpm build` en sí
   mismo. Lo que #6 debe demostrar no es que exista un script de comprobación, sino que
   **el mecanismo dispara**: el fixture de T-06-4 introduce a propósito un import de
   `cms/security` desde un componente cliente, se comprueba que la build falla, y se
   revierte.

La capa 1 no basta sola: `server-only` solo actúa sobre lo que el bundler realmente
arrastra al cliente, así que un módulo del núcleo que nadie importa todavía puede quedarse
sin protección hasta el día en que alguien lo importe mal. La capa 1 lo obliga desde el
primer commit. La capa 2 es la que de verdad para una fuga.

Queda **fuera** del contrato el escaneo de los chunks de `.next/static/` en busca de
cadenas: es una heurística, no una garantía (el bundler minifica y renombra), y añadirla
daría una falsa sensación de cobertura sobre un caso que la capa 2 ya cubre de raíz.

## 4. Casos de prueba — la definición de "hecho"

Cada caso es observable y verificable en CI o en local. Los tests se escriben **desde esta
tabla**, no desde la implementación (regla de proceso 1).

### 4.1 Scaffold (#2)

| ID | Caso | Verificación |
|---|---|---|
| T-02-1 | El proyecto arranca en desarrollo | `pnpm dev` responde 200 en `/` |
| T-02-2 | La build de producción pasa | `pnpm build` termina con código 0 |
| T-02-3 | TypeScript está en modo estricto real | `tsconfig.json` tiene `strict: true` **y** `noUncheckedIndexedAccess: true`; un acceso `arr[0]` sin comprobar produce error de tipo |
| T-02-4 | El alias `@/` resuelve | un import `@/cms/...` compila (SPEC §5.1) |
| T-02-5 | Tailwind compila | el CSS generado contiene la utilidad usada en el layout |

### 4.2 Frontera server-only (#3)

| ID | Caso | Verificación |
|---|---|---|
| T-03-1 | Todo módulo de `cms/{core,db,auth,security}` importa `server-only` | test unitario que recorre el árbol; **falla** si falta |
| T-03-2 | Las excepciones son explícitas | un fichero con `// isomorphic:` se acepta; uno sin él y sin `server-only` falla |
| T-03-3 | Existe el árbol de SPEC §3 | test unitario con la lista literal de directorios de §3.3; falla si falta alguno |

### 4.3 Calidad (#4)

| ID | Caso | Verificación |
|---|---|---|
| T-04-1 | `sql.raw` con input de usuario es error de lint | fichero fixture con `sql.raw(userInput)` → ESLint devuelve error (SPEC §7.1) |
| T-04-2 | `dangerouslySetInnerHTML` es error **en cualquier ruta**, sin allowlist | fixture en `components/` → error; fixture en `cms/preview/` → también error (SPEC §7.1; ADR-107, issue #19) |
| T-04-3 | El repo está formateado | `pnpm format:check` código 0 |
| T-04-4 | El hook de pre-commit corre lint-staged | commit con un fichero mal formateado lo arregla o aborta |

### 4.4 Harness de tests (#5)

| ID | Caso | Verificación |
|---|---|---|
| T-05-1 | `test:unit` corre sin BD | pasa con `DATABASE_URL` sin definir |
| T-05-2 | `test:integration` se salta con mensaje claro sin BD | código 0 y aviso explícito, no un fallo opaco |
| T-05-3 | `expectTypeOf` está disponible | un test de tipos trivial pasa (lo exige M1) |
| T-05-4 | El e2e arranca la app y la home responde | Playwright verde contra el build de producción |
| T-05-5 | La cobertura se recoge | se genera reporte; umbral declarado pero no aplicado hasta M3 |

### 4.5 CI (#6)

| ID | Caso | Verificación |
|---|---|---|
| T-06-1 | Un fallo de lint pone `ci` en rojo | commit deliberado en el PR, con enlace a la ejecución |
| T-06-2 | El arreglo pone `ci` en verde | commit siguiente, con enlace |
| T-06-3 | El job de integración tiene Postgres | el paso de conexión al servicio termina OK |
| T-06-4 | El guard de bundle detecta una fuga | fixture temporal que importa `cms/security` desde un componente cliente → build falla (se ejecuta una vez y se revierte, evidencia en el PR) |
| T-06-5 | `pnpm audit` se ejecuta | paso presente en el log |

### 4.6 Repositorio (#7, #8, #9)

| ID | Caso | Verificación |
|---|---|---|
| T-08-1 | `main` no acepta push directo | `git push origin main` es rechazado |
| T-08-2 | Un PR sin `ci` verde no se puede mergear | el botón de merge está bloqueado |
| T-08-3 | Las plantillas se aplican | un PR nuevo aparece prerrellenado |
| T-09-1 | `.env.example` cubre §7.4 | las 6 variables presentes y comentadas |
| T-09-2 | No hay secretos en el repo | `.env` ignorado; revisión del diff |

## 5. Definition of Done de M0

Copiada del prompt de la fase y ampliada con lo verificable:

1. CI verde en un PR trivial (T-06-1/T-06-2 demostrados con enlaces).
2. `main` protegida (T-08-1/T-08-2).
3. `pnpm dev` levanta (T-02-1).
4. Todos los casos de prueba de §4 pasan. Un caso puede **posponerse** a otro hito con
   justificación escrita en el PR y un issue que lo recoja; lo que no puede es darse por
   bueno estando en rojo.
5. `docs/PROGRESS.md` cierra M0 con: qué funciona, qué es frágil, qué probar a mano.

## 6. Decisiones que exigen ADR

Registradas en [`../DECISIONS.md`](../DECISIONS.md):

- **ADR-100** — Fijar Next.js 15 aunque exista una mayor superior.
- **ADR-101** — TypeScript 5.9 en lugar de la mayor siguiente.
- **ADR-102** — Vitest 3.2 en lugar de la mayor siguiente.
- **ADR-103** — ESLint 9 (flat config) por compatibilidad con `eslint-config-next` 15.
- **ADR-104** — Auto-revisión sin aprobación: GitHub prohíbe aprobar el PR propio.
- **ADR-105** — `enforce_admins: false` en la protección de rama.
- **ADR-106** — `RichText` vive en `cms/preview/`, no en `cms/ui/`.
- **ADR-107** — El richtext se renderiza como elementos de React, nunca como cadena de
  HTML; `dangerouslySetInnerHTML` queda prohibido sin excepciones (resuelve el issue #19).
