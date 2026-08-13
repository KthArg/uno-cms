# Guía del desarrollador

> **Estado: parcial.** La parte de "levantar el proyecto" es real y funciona hoy. La de
> "montar el CMS sobre una landing nueva" se escribe en **M6**, cuando exista el proyecto
> de ejemplo que la valida. La meta de `SPEC.md` §11.6 es que un desarrollador externo lo
> consiga en menos de una hora.

## Levantar el proyecto en local

Requisitos: **Node ≥ 22** (el repositorio usa 24, ver `.nvmrc`) y **pnpm 10**.

```sh
git clone https://github.com/KthArg/uno-cms.git
cd uno-cms
pnpm install
cp .env.example .env.local   # y rellénalo; ver los comentarios del propio fichero
pnpm dev                     # http://localhost:3000
```

Hoy, en M0, el proyecto arranca con una página provisional. No hay panel ni base de datos
todavía: eso llega en M1 y M2.

## Comandos

| Comando                             | Qué hace                                                                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                          | Servidor de desarrollo. `PORT=3100 pnpm dev` si el 3000 está ocupado                                                                                         |
| `pnpm build`                        | Build de producción. **También es el guard de seguridad** de la frontera servidor/cliente: falla si algo de `cms/{core,db,auth,security}` alcanza el cliente |
| `pnpm typecheck`                    | `next typegen` y luego `tsc --noEmit`                                                                                                                        |
| `pnpm lint`                         | ESLint con `--max-warnings=0`                                                                                                                                |
| `pnpm format` / `pnpm format:check` | Prettier                                                                                                                                                     |
| `pnpm test:unit`                    | Vitest, proyecto `unit`, con tests de tipos                                                                                                                  |
| `pnpm test:integration`             | Vitest contra Postgres. **Sin `DATABASE_URL` se salta con aviso**, no falla                                                                                  |
| `pnpm test:e2e`                     | Playwright contra el build de producción. Antes: `pnpm exec playwright install chromium`                                                                     |
| `pnpm test:coverage`                | Cobertura. El umbral de SPEC §11.4 solo se aplica con `COVERAGE_ENFORCE=1`                                                                                   |

## Antes de subir una rama

`ci` ejecuta seis comprobaciones y cualquiera de ellas bloquea el merge. Ejecutarlas en
local cuesta menos que esperar al pipeline:

```sh
pnpm lint && pnpm typecheck && pnpm test:unit && pnpm build
DATABASE_URL=postgres://unocms:unocms@localhost:5432/unocms_test pnpm test:integration
pnpm test:e2e
```

`pnpm typecheck` es el que más fácil se olvida, porque `pnpm test:unit` también comprueba
tipos — **pero solo los de los ficheros de test**. Un error de tipos en `cms/` pasa los
tests unitarios y rompe CI.

## Cómo trabaja este repositorio

- **`SPEC.md` manda.** Ante ambigüedad, gana la spec. Cuando la spec calla, se decide y se
  escribe un ADR en [`DECISIONS.md`](DECISIONS.md). Cuando la spec **se contradice**, se
  abre un issue `spec-question` y no se resuelve en silencio.
- **Un documento de fase por hito** en [`specs/`](specs/), con los casos de prueba que
  definen "hecho" **antes** de escribir el código.
- **Una rama por issue, un PR por rama.** `main` está protegida: sin `ci` en verde no entra
  nada, ni siendo dueño del repositorio.
- **Cada PR lleva una auto-revisión escrita** con hallazgos reales y sus correcciones. No
  es teatro: en M0, 8 de 9 PR cambiaron por ella. Los límites de esta práctica están en
  ADR-104.

## Reglas de seguridad que el linter hace cumplir

No son recomendaciones; rompen el build (SPEC §7.1):

- **`dangerouslySetInnerHTML` está prohibido en todo el proyecto**, sin allowlist. El
  richtext se renderiza como elementos de React desde una allowlist de nodos, así que nunca
  se construye una cadena de HTML (ADR-107, issue #19).
- **`sql.raw` está prohibido.** Drizzle parametriza con `sql` etiquetado. ESLint no puede
  distinguir una constante de la entrada del usuario, así que se prohíbe entero.
- **`cms/core`, `cms/db`, `cms/auth` y `cms/security` importan `server-only`** en su primera
  línea. La excepción `// isomorphic: <motivo>` existe, exige motivo escrito, y `cms/preview`
  es el único árbol exento por diseño (ADR-106).

## Índice de lo que falta (M6)

1. **Adaptar UnoCMS a otra landing** — los tres pasos de `SPEC.md` §6.3: escribir
   `cms.config.ts`, escribir secciones que usen `useContent`, componer `page.tsx`.
2. Referencia completa de los tipos de campo de `s.*`.
3. El contrato de `useContent` y `data-cms-key`.
4. Cómo añadir un tipo de campo nuevo.
5. Modelo de datos y migraciones.
6. Despliegue e integraciones.
