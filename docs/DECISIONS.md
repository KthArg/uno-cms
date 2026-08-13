# Decisiones de arquitectura (ADR)

Registro de las decisiones **no cubiertas por `SPEC.md`**. Las decisiones que sí están en
la spec viven allí (`SPEC.md` §1, ADR-001…ADR-007) y no se duplican aquí.

Formato: contexto (por qué hubo que decidir) → decisión → consecuencias (incluido lo malo).
Numeración: ADR-1xx para M0, ADR-2xx para M1, y así sucesivamente.

---

## ADR-100 — Fijar Next.js 15, no la mayor siguiente

**Contexto.** `SPEC.md` §2 dice "Next.js 15 (App Router, React 19, Server Actions)". En el
momento de escribir esto ya existe una mayor posterior de Next disponible en npm.

**Decisión.** Se fija `next@15.5.x`. La spec nombra la mayor de forma explícita y la regla
de proceso dice que ante ambigüedad manda la spec; aquí no hay ni ambigüedad.

**Consecuencias.** El proyecto arranca con una mayor que no es la última. A cambio, todo el
material de referencia del que parte la spec (App Router de Next 15, comportamiento de
`unstable_cache`, `revalidateTag`, Server Actions) coincide con lo implementado. Subir de
mayor es un trabajo propio, con su ADR y su PR, y no se hace dentro del MVP.

---

## ADR-101 — TypeScript 5.9

**Contexto.** `SPEC.md` §2 exige "TypeScript estricto (`strict: true`,
`noUncheckedIndexedAccess`)" sin fijar versión. Existe una mayor de TypeScript posterior a
la serie 5.

**Decisión.** `typescript@5.9.x`.

**Consecuencias.** Es la serie con la que `eslint-config-next` 15, `typescript-eslint` y
`vitest --typecheck` están probados. Se renuncia a las mejoras de la mayor siguiente;
ninguna es necesaria para el MVP. Riesgo asumido: en algún momento habrá que migrar.

---

## ADR-102 — Vitest 3.2

**Contexto.** `SPEC.md` §2 dice "Vitest" sin versión. Hay una mayor posterior.

**Decisión.** `vitest@3.2.x` con `@vitest/coverage-v8` de la misma serie, usando la API de
`projects` para separar `unit` de `integration`.

**Consecuencias.** `projects`, `--typecheck` y los umbrales de cobertura por glob que
exige `SPEC.md` §11.4 están disponibles y estables en 3.2. Se evita estrenar una mayor en
la pieza que sostiene el criterio de aceptación de cobertura.

---

## ADR-103 — ESLint 9 con flat config

**Contexto.** `SPEC.md` §2 pide "ESLint (config next + security)". `eslint-config-next` de
la serie 15 declara compatibilidad con ESLint 8 y 9; existe una mayor posterior de ESLint
que ese paquete todavía no soporta.

**Decisión.** `eslint@9.x` con `eslint.config.mjs` (flat config).

**Consecuencias.** Compatibilidad garantizada con el config oficial de Next. Flat config es
el formato que ESLint mantendrá a futuro, así que la migración posterior es menor.

---

## ADR-104 — Auto-revisión sin aprobación formal

**Contexto.** La regla de proceso 2 exige, tras abrir cada PR, cambiar de rol a revisor,
dejar los hallazgos como comentarios de review reales, corregirlos y "solo entonces
aprobar y mergear". GitHub **rechaza** que el autor de un PR lo apruebe
(`Can not approve your own pull request`). El repositorio tiene un único actor.

**Decisión.** La auto-revisión se materializa como:

1. `gh pr review --comment` con los hallazgos reales sobre el diff completo, incluida la
   pasada por el checklist de `SPEC.md` §7.1.
2. Commits de corrección sobre la misma rama, referenciados en el hilo.
3. Un comentario final que declara la revisión cerrada y enumera lo que queda como riesgo
   conocido.
4. `required_approving_review_count: 0` en la protección de rama.

**Consecuencias.** El requisito literal de "aprobación" no se cumple porque es imposible
con un solo actor; lo que sí se cumple —y es lo que aporta valor— es que cada PR tiene una
pasada de revisión escrita y trazable. **Brecha residual honesta:** no existe un segundo
par de ojos. Ningún hallazgo se descubre por contraste con otra persona.

---

## ADR-105 — `enforce_admins: true` en la protección de `main`

> **Este ADR sustituye a su primera versión, que decidía `enforce_admins: false`.** La
> decisión original era incorrecta y el caso de prueba T-08-1 lo demostró. Se conserva el
> razonamiento fallido porque explica por qué se llegó a él.

**Contexto.** El repositorio tiene un único mantenedor, que además es admin. Con
`enforce_admins: false`, las reglas de protección (PR obligatorio, check `ci`, conversación
resuelta, historial lineal) quedan activas para cualquiera **menos** para él.

El razonamiento inicial fue: si alguna vez se exigieran aprobaciones y solo hay una
persona, `enforce_admins: true` dejaría el repositorio en bloqueo total, porque nadie puede
aprobar su propio PR. Se prefirió dejar la puerta abierta.

**Lo que pasó al ejecutar T-08-1.** Con `enforce_admins: false`, un `git push origin main`
directo **entró sin resistencia**. No fue una brecha teórica: quedó un commit vacío en el
historial de `main`, y para quitarlo hubo que habilitar force-push temporalmente
—`allow_force_pushes: false` sí se aplica a los admins, a diferencia del requisito de PR—.
El primer intento serio de saltarse la barrera la atravesó, y no a propósito: fue el propio
test el que la cruzó.

El razonamiento inicial tenía además un error de hecho: el bloqueo total que temía requiere
`required_approving_review_count > 0`, y ese valor es **0** (ADR-104). Se estaba protegiendo
contra una configuración que no existe, a costa de anular la protección que sí existe.

**Decisión.** `enforce_admins: true`. Ni siquiera el mantenedor puede hacer push directo a
`main`; todo pasa por PR con `ci` en verde.

La configuración completa vive versionada en
[`.github/branch-protection.json`](../.github/branch-protection.json), de modo que es
auditable en el repositorio y reaplicable con un solo comando, en vez de ser un ajuste
invisible en la interfaz de GitHub.

**Consecuencias.**

- La protección pasa de ser una barrera de proceso a un control técnico real. T-08-1
  verificado: `GH006: Protected branch update failed`.
- **Riesgo asumido:** si el pipeline se rompiera por una causa ajena (por ejemplo, la
  retirada de Node 20 en los runners, que ya afecta a `pnpm/action-setup@v4`), no se podría
  mergear nada hasta arreglarlo. La salida sería desactivar la protección temporalmente
  —cosa que un admin sí puede hacer, porque `enforce_admins` restringe las operaciones de
  git, no la edición de la configuración—. Es una salida deliberada y con fricción, que es
  justo lo que se quiere.
- **Brecha residual, ahora sí la única:** un admin puede desactivar la protección, hacer lo
  que quiera y volver a activarla. Ningún ajuste de GitHub lo impide en un repositorio de
  un solo dueño. La diferencia con la situación anterior es que ahora saltársela exige tres
  actos deliberados y deja rastro en el registro de auditoría del repositorio, en lugar de
  ocurrir con un `git push` distraído.

---

## ADR-106 — `RichText` vive en `cms/preview/`, no en `cms/ui/`

**Contexto.** `SPEC.md` §6.3 introduce `<RichText value={...} />` como parte del contrato
con los componentes de la **landing**: convierte el JSON de ProseMirror a HTML pasando
siempre por `sanitize.ts`. Pero `SPEC.md` §3 no le asigna ubicación en el árbol, y la
decisión no es cosmética por dos razones:

1. La regla de ESLint que prohíbe `dangerouslySetInnerHTML` fuera de una allowlist
   (§7.1) necesita una ruta literal, y esa regla se implementa en el issue #4.
2. Si `RichText` cayera en `cms/ui/` —el árbol del panel— los componentes públicos de la
   landing importarían desde el árbol del panel, lo que choca con `SPEC.md` §8: "el
   visitante jamás descarga código del panel".

**Decisión.** `cms/preview/RichText.tsx`.

`cms/preview/` ya alberga `useContent.ts`, que tiene exactamente la misma naturaleza:
código de cliente, isomorfo, consumido por los componentes de la landing tanto en
producción como en la vista previa. `RichText` pertenece a ese conjunto. La alternativa
—crear un `cms/render/`— resolvía lo mismo pero inventaba un directorio que `SPEC.md` §3
no contempla, y la regla es no desviarse del árbol de la spec sin necesidad.

**Consecuencias.** El nombre del directorio queda algo desafortunado: `cms/preview/`
contiene código que también corre en producción. Se asume a cambio de no tocar el árbol de
la spec. Consecuencia operativa: `cms/preview/` es el único árbol de `cms/` que **no**
lleva `server-only`, y así queda anotado en el documento de fase §3.3 y §3.5. Que
`RichText` pueda ser isomorfo sin violar §7.1 depende de ADR-107.

---

## ADR-107 — El richtext se renderiza como elementos de React, nunca como cadena de HTML

**Contexto.** Registrado en detalle en el issue #19 (`spec-question`). En resumen, tres
afirmaciones de `SPEC.md` son incompatibles: §6.3 dice que `RichText` sanea "siempre" con
`sanitize.ts`; §7.1 obliga a que `cms/security/` sea `server-only`; y §6.1 exige que en
`/preview` el contenido tecleado se renderice **en el cliente**, sin red ni BD. Un
componente de cliente no puede llamar a un módulo server-only.

Se descartaron dos salidas: hacer `sanitize.ts` isomorfo (viola §7.1 de frente) y no
sanear en la preview (un XSS en la preview es un XSS same-origin con la sesión del editor).

**Decisión.** El renderizador recorre el JSON de ProseMirror y emite **elementos de
React** según la allowlist de nodos y marcas de §6.3 (`p`, `strong`, `em`,
`a[href http/https/mailto]`, `ul`, `ol`, `li`, `h2`–`h4`, `blockquote`); lo que no está en
la allowlist se descarta. Nunca se construye una cadena de HTML, así que no se usa
`dangerouslySetInnerHTML` en ninguna parte del proyecto.

`cms/security/sanitize.ts` sigue existiendo y sigue siendo server-only: su trabajo es
sanear el **JSON al guardar** (podar nodos y marcas fuera de allowlist, validar el
protocolo de los `href` contra `javascript:`), que es lo que §7.1 llama "sanitización
server-side en save".

**Consecuencias.**

- La exigencia de §7.1 de sanear "en save Y en render" se cumple con una garantía más
  fuerte: en render no se sanea una cadena, es que no hay cadena que sanear. React escapa
  el texto por defecto y no queda ningún punto de inyección de markup.
- **Desviación de §2:** `rehype-sanitize` deja de ser necesario y no se instala, porque no
  hay "HTML derivado" sobre el que operar. Es la única desviación del stack que introduce
  esta decisión.
- **Efecto en M0:** la regla de ESLint del issue #4 prohíbe `dangerouslySetInnerHTML` sin
  allowlist. Es más estricta que el criterio de aceptación original del issue, no más laxa.
- **Pendiente de verificación:** que la salida C se sostenga en la práctica no se sabrá
  hasta implementar el renderizador en M5. El issue #19 queda abierto hasta entonces.

---

## ADR-200 — Driver de base de datos según el destino

**Contexto.** Registrado en detalle en el issue #43 (`spec-question`). ADR-002 fija
`@neondatabase/serverless` (HTTP) con un motivo real: en serverless, un driver TCP abriría
una conexión por invocación y agotaría el free tier de Neon. `SPEC.md` §11.4 exige tests de
integración contra Postgres efímero. El driver HTTP de Neon no habla con un `postgres:16`
en un runner: no son el mismo protocolo.

Se descartaron: usar `node-postgres` en todas partes (rompe el motivo de ADR-002) y montar
el proxy HTTP de Neon en CI (una imagen de terceros en el camino crítico de todos los PR,
imposible de arreglar desde este proyecto si se rompe).

**Decisión.** `cms/db/index.ts` selecciona el driver y expone **el mismo tipo** de Drizzle
hacia arriba. La selección es explícita —variable de entorno `DB_DRIVER` con valores
`neon` y `pg`— y la detección por host solo actúa como valor por defecto cuando no se
declara. Adivinar el driver sin poder forzarlo sería frágil justo donde no conviene.

Esto no es un rodeo a ADR-002: es la costura que ADR-002 ya describía cuando decía
"detrás de una interfaz `db/` para no acoplar".

**Consecuencias.**

- El esquema, las consultas y las acciones no saben qué driver hay debajo. Si los tipos de
  Drizzle divergieran entre ramas, lo detecta `typecheck`.
- **Brecha residual honesta:** los tests de integración ejercitan esquema, consultas y
  migraciones, pero **no el driver de producción**. Un fallo específico del driver HTTP de
  Neon no lo atraparía CI. Lo cubre el despliegue de verificación de M6, no los tests, y
  por eso el issue #43 queda abierto hasta entonces.
- Una dependencia más (`pg`), solo en desarrollo y test.

---

## ADR-201 — Unicidad de email por índice sobre `lower(email)`, sin `citext`

**Contexto.** `SPEC.md` §4 comenta, junto a la columna `email`, "citext en migración; unique
lower(email)". Las dos cosas a la vez son redundantes: `citext` es un tipo que ignora
mayúsculas, y un índice único sobre `lower(email)` consigue lo mismo sin cambiar el tipo.

**Decisión.** Solo el índice único sobre `lower(email)`, sobre una columna `text`. Las
consultas de búsqueda por email comparan también por `lower()`.

**Consecuencias.** No se depende de que la extensión `citext` esté disponible ni instalada
en el Postgres de destino, cosa que no controlamos en un despliegue auto-hospedado. A
cambio, cualquier consulta que busque por email debe acordarse de usar `lower()`: si alguien
lo olvida, la consulta no fallará, simplemente no encontrará al usuario. Es un fallo
silencioso, y por eso el acceso por email se concentrará en una única función en `cms/auth/`
en M2 en lugar de repartirse por el código.

---

## ADR-202 — Regla de presencia: `required`, `default` y opcionalidad

**Contexto.** `SPEC.md` §5.1 usa `required: true` en unos campos y `default: true` en otro,
y §5.1 exige derivar dos esquemas Zod —laxo para guardar borradores, estricto para
publicar— más los tipos TypeScript. Qué significa cada combinación no está escrito.

**Decisión.** Una sola regla, de la que se derivan tipos y ambos esquemas:

| Declaración      | Tipo TS          | Laxo (borrador)      | Estricto (publicar)        |
| ---------------- | ---------------- | -------------------- | -------------------------- |
| `required: true` | `V`              | opcional             | obligatorio y **no vacío** |
| `default: x`     | `V`              | opcional, se rellena | opcional, se rellena       |
| ninguno          | `V \| undefined` | opcional             | opcional                   |

"No vacío" es más que "presente" **para los tipos que llevan contenido**: una cadena de
espacios no cuenta, un `RichTextDoc` sin texto tampoco, y una imagen sin `url` tampoco. Un
editor que teclea un espacio en el título y publica no debería pasar la puerta.

Para `boolean` y `number`, en cambio, **presente es suficiente**. `false` y `0` son valores
legítimos, y aplicarles una comprobación de veracidad haría imposible publicar un booleano
obligatorio en `false` o una valoración de `0`. La tabla completa por tipo está en el
documento de fase §3.2; se detalla ahí y no aquí porque es donde la va a leer quien
implemente.

`required` junto a `default` se **rechaza** al construir la config, con un mensaje que
nombra el campo: la combinación no tiene sentido —el default satisface siempre el
requisito— y aceptarla en silencio dejaría al desarrollador creyendo que ha marcado algo
como obligatorio cuando no lo ha hecho.

**Consecuencias.** El tipo que ve la landing (`Content<K>`) refleja el esquema **estricto**,
porque la landing solo lee contenido publicado y publicado implica estricto superado. El
borrador tiene su propio tipo (`Draft<K>`), con todo opcional. Son dos tipos distintos a
propósito: confundirlos es cómo se acaba renderizando `undefined` en producción.
