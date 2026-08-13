# 01 — Núcleo de datos y configuración (M1)

> Documento de fase derivado de `SPEC.md`. Fuente de verdad: `SPEC.md`.
> Secciones cubiertas: §4 (esquema de base de datos), §5.1 (`cms.config.ts`), §5.2 (lectura
> de contenido), ADR-002 (Postgres + Drizzle), ADR-003 (contenido como JSONB validado).
>
> Ante silencio de la spec, la decisión se toma aquí y queda como ADR en
> [`../DECISIONS.md`](../DECISIONS.md).

---

## 1. Alcance

M1 entrega el modelo de datos y el contrato del desarrollador: el archivo que el dev edita
(`cms.config.ts`), los esquemas Zod que se derivan de él, los tipos TypeScript que consumirá
la landing, y las tablas donde vive todo. **Nada de autenticación, nada de acciones, nada de
interfaz.**

| Issue | Entrega                                                          |
| ----- | ---------------------------------------------------------------- |
| #37   | Este documento                                                   |
| #38   | `defineConfig` y `s.*` con inferencia de tipos (§5.1)            |
| #39   | `schema-gen`: Zod laxo y estricto por tipo de campo              |
| #40   | Esquema Drizzle de §4, migraciones y cliente de base de datos    |
| #41   | Harness de integración con migraciones y aislamiento entre tests |
| #42   | `cms.config.ts` de ejemplo y seed de singletons                  |

Orden: **#37 → #38 → #39 → #40 → #41 → #42**. #39 consume los descriptores de #38; #41
necesita las migraciones de #40; #42 necesita todo lo anterior.

## 2. Fuera de alcance de M1

- Lectura cacheada de contenido (`getContent`, `getCollection` de §5.2) → **M3**, porque
  depende de `unstable_cache` y de los tags de revalidación, que pertenecen al ciclo de
  publicación.
- Cualquier mutación (`saveDraft`, `publish`, …) → **M3**.
- Auth.js, `users` con contraseñas reales → **M2**. La **tabla** `users` sí se crea aquí,
  porque las claves foráneas de `content_entries`, `media` y `revisions` la necesitan.
- Componentes de campo (`cms/ui/fields/`) → **M4**. Aquí solo se define el **contrato** de
  tipos que esos componentes implementarán.
- `nanoid` para claves de colección → se instala en **M3**, con `createItem`.

## 3. Contratos

### 3.1 Tipos de campo (`SPEC.md` §5.1)

Ocho tipos en el MVP. Cada uno declara su tipo de valor, sus opciones y cómo se valida.

| Tipo       | Valor TS                           | Opciones propias                     | Validación estricta                                                                      |
| ---------- | ---------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `text`     | `string`                           | `min`, `max`, `multiline`, `default` | longitud dentro de rango; no vacío si `required`                                         |
| `richtext` | `RichTextDoc`                      | `default`                            | documento ProseMirror con nodos de la allowlist de §6.3                                  |
| `number`   | `number`                           | `min`, `max`, `integer`, `default`   | dentro de rango; entero si `integer`                                                     |
| `boolean`  | `boolean`                          | `default`                            | —                                                                                        |
| `select`   | unión literal de `options[].value` | `options` (obligatorio), `default`   | valor ∈ `options`                                                                        |
| `link`     | `string`                           | `default`                            | **protocolo en allowlist**: `http`, `https`, `mailto`, `tel`, o ruta que empiece por `/` |
| `image`    | `ImageValue`                       | `decorative`                         | `url` presente; `alt` no vacío salvo `decorative: true`                                  |
| `color`    | `string`                           | `default`                            | `#rgb`, `#rrggbb` o `#rrggbbaa`                                                          |

```ts
type RichTextDoc = { type: 'doc'; content: RichTextNode[] };
type ImageValue = {
  mediaId: string;
  url: string;
  alt: string;
  width?: number;
  height?: number;
};
```

Opciones comunes a todos: `label` (obligatoria, es lo que ve el editor), `required`,
`help`, `default`.

**`link` es un tipo de campo de seguridad, no de conveniencia.** `SPEC.md` §7.1 exige
bloquear `javascript:`; la validación de protocolo vive en el esquema, no en el componente,
para que ninguna ruta de escritura pueda saltársela.

### 3.2 Presencia: `required`, `default` y opcionalidad

Regla única, y de ella se derivan tanto los tipos como los dos esquemas Zod:

| Declaración      | Tipo TS          | Esquema laxo (borrador)      | Esquema estricto (publicar)  |
| ---------------- | ---------------- | ---------------------------- | ---------------------------- |
| `required: true` | `V`              | opcional                     | **obligatorio y no vacío**   |
| `default: x`     | `V`              | opcional, se rellena con `x` | opcional, se rellena con `x` |
| ninguno          | `V \| undefined` | opcional                     | opcional                     |

**Qué significa "no vacío", por tipo.** Se define para los ocho, porque en dos de ellos la
interpretación mecánica de "no vacío" da la respuesta equivocada:

| Tipo                              | Un requerido se satisface con…                                                                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text`, `link`, `color`, `select` | cadena distinta de `''` **tras recortar espacios**                                                                                                    |
| `richtext`                        | un `RichTextDoc` con al menos un nodo con texto                                                                                                       |
| `image`                           | un `ImageValue` con `url`                                                                                                                             |
| `boolean`                         | **estar presente**. `false` es un valor válido: si "no vacío" significara "verdadero", un booleano obligatorio no se podría publicar nunca en `false` |
| `number`                          | **estar presente**. `0` es un valor válido: `rating: 0` o `precio: 0` son legítimos, y un `if (!valor)` los trataría como ausentes                    |

Las dos últimas filas existen porque son el error que se escribe solo. Quien implemente #39
no debe usar una comprobación de veracidad genérica sobre el valor.

El **laxo** existe porque el editor guarda continuamente mientras escribe (autosave de
`SPEC.md` §8) y un borrador a medias tiene que poder guardarse. El **estricto** es la puerta
de publicación: `SPEC.md` §5.3 exige que `publish` devuelva `VALIDATION_FAILED` con la lista
de campos por completar.

Un campo con `required: true` **y** `default` no tiene sentido (el default lo satisface
siempre). `defineConfig` lo rechaza en tiempo de ejecución al arrancar, no lo ignora.

### 3.3 Inferencia de tipos (`SPEC.md` §5.1, §5.2)

```ts
import config from '@/cms.config';

type Hero = Content<'hero'>;
// { title: string; subtitle?: string; ctaLabel?: string; ctaHref?: string; image?: ImageValue }

type Testimonial = CollectionItem<'testimonials'>;
// { author: string; quote: string; avatar?: ImageValue; rating?: number }

type HeroDraft = Draft<'hero'>; // todo opcional
```

`SingletonKey` y `CollectionKey` son uniones literales derivadas de la config. Un
`Content<'noExiste'>` debe ser **error de compilación**, no `never` silencioso.

Esto se verifica con `expectTypeOf` (T-38-*), no solo a ojo: una inferencia que se degrada a
`any` sigue compilando y deja de proteger sin avisar.

### 3.4 Esquema de base de datos

El de `SPEC.md` §4, literal: `users`, `content_entries`, `revisions`, `media`, `audit_log`,
`settings`. Migraciones generadas con `drizzle-kit` y **commiteadas** (ADR-002).

Dos correcciones al fragmento de la spec, que no compila tal cual:

1. El índice `users_email_lower_idx` usa `sql` sin importarlo. Se importa de `drizzle-orm`.
2. `citext` aparece como comentario ("citext en migración"). No se usa la extensión: el
   índice único sobre `lower(email)` ya garantiza unicidad sin distinguir mayúsculas, y no
   depende de que la extensión esté disponible en el Postgres de destino. La comparación en
   las consultas también irá por `lower()`.

### 3.5 Cliente de base de datos

ADR-002 fija `@neondatabase/serverless` (HTTP). `SPEC.md` §11.4 exige tests de integración
"contra Postgres efímero". **Las dos cosas juntas no se pueden cumplir literalmente**: el
driver HTTP de Neon habla con el endpoint de Neon, no con un `postgres:16` en un runner.
Registrado como issue `spec-question` y resuelto en ADR-200: `cms/db/index.ts` selecciona
driver según el destino —Neon HTTP en producción, `node-postgres` contra Postgres normal—
exponiendo **el mismo tipo** de Drizzle hacia arriba, que es justo la interfaz `db/` que
ADR-002 ya anticipaba.

### 3.6 Seed de singletons (`SPEC.md` §5.1)

"Al arrancar, cada singleton sin fila en BD se crea con valores vacíos/default."

Contrato: función idempotente en `cms/core/seed.ts` que, dada la config, inserta las filas
que falten con el draft resultante de aplicar los `default` sobre un objeto vacío, `status`
`'draft'`, `published` `null` y `version` `0`. **No toca las filas existentes**: un seed que
sobreescriba un borrador ajeno destruye trabajo del editor.

**El draft sembrado no pasa el esquema estricto** si el singleton tiene campos `required`
sin `default`, y eso es lo correcto: es un borrador vacío, todavía no publicable. Se dice
aquí porque el primer `VALIDATION_FAILED` justo después de sembrar parece un seed roto y no
lo es.

Cuándo se ejecuta no se decide aquí (es de M2/M4, con el arranque y el panel). M1 entrega la
función y sus tests.

## 4. Casos de prueba — la definición de "hecho"

### 4.1 Config e inferencia (#38)

| ID     | Caso                                                           | Verificación                                                             |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| T-38-1 | `defineConfig` acepta el ejemplo de SPEC §5.1 tal cual         | compila y devuelve la config                                             |
| T-38-2 | `Content<'hero'>` infiere obligatorios y opcionales            | `expectTypeOf`: `title` es `string`, `subtitle` es `string \| undefined` |
| T-38-3 | `Content<K>` con una clave inexistente es error de compilación | test de tipos negativo (`@ts-expect-error`)                              |
| T-38-4 | `select` infiere la unión de sus valores                       | `expectTypeOf<...>().toEqualTypeOf<'a' \| 'b'>()`                        |
| T-38-5 | `default` hace el campo no opcional en el tipo                 | `visible: boolean`, no `boolean \| undefined`                            |
| T-38-6 | `required` + `default` a la vez se rechaza                     | `defineConfig` lanza con mensaje que nombra el campo                     |
| T-38-7 | `CollectionItem<K>` infiere desde `schema`                     | `expectTypeOf` sobre `testimonials`                                      |

### 4.2 Generación de esquemas (#39)

| ID      | Caso                                           | Verificación                                                                               |
| ------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| T-39-1  | El laxo acepta un borrador vacío               | `{}` pasa                                                                                  |
| T-39-2  | El laxo rechaza el tipo equivocado             | `{ title: 42 }` falla                                                                      |
| T-39-3  | El estricto rechaza un requerido ausente       | error con la **ruta** del campo, para el mensaje de §9                                     |
| T-39-4  | El estricto rechaza un requerido en blanco     | `'   '` falla igual que ausente                                                            |
| T-39-5  | `max` se aplica en ambos esquemas              | 121 caracteres con `max: 120` falla                                                        |
| T-39-6  | **`link` bloquea `javascript:`**               | `javascript:alert(1)` falla; también con mayúsculas, espacios iniciales y `\0` intercalado |
| T-39-7  | `link` acepta lo de la allowlist               | `https://`, `mailto:`, `tel:`, `/ruta`                                                     |
| T-39-8  | `image` exige `alt` salvo `decorative`         | ambos sentidos                                                                             |
| T-39-9  | `color` solo acepta hexadecimal                | `red` falla, `#fff` pasa                                                                   |
| T-39-10 | `richtext` rechaza nodos fuera de la allowlist | un nodo `script` falla                                                                     |
| T-39-11 | `default` se aplica al parsear                 | ausente → valor por defecto en la salida                                                   |
| T-39-12 | `number` con `integer` rechaza decimales       | `1.5` falla                                                                                |

T-39-6 es el caso más importante de la fase: es la mitigación de XSS por URL de `SPEC.md`
§7.1 y tiene que resistir variantes ofuscadas, no solo la literal.

### 4.3 Base de datos y migraciones (#40)

| ID     | Caso                                                  | Verificación                                       |
| ------ | ----------------------------------------------------- | -------------------------------------------------- |
| T-40-1 | Las migraciones aplican sobre una base vacía          | integración en CI                                  |
| T-40-2 | Las seis tablas de §4 existen con sus columnas        | consulta a `information_schema`                    |
| T-40-3 | `content_entries.key` es único                        | insertar dos veces falla                           |
| T-40-4 | El email es único sin distinguir mayúsculas           | `A@b.com` y `a@b.com` colisionan                   |
| T-40-5 | Borrar un usuario no borra su contenido               | `updated_by` queda a `NULL` (`on delete set null`) |
| T-40-6 | Los enum de `status` y `role` rechazan valores ajenos | insertar `'publicado'` falla                       |

### 4.4 Harness de integración (#41)

| ID     | Caso                                               | Verificación                               |
| ------ | -------------------------------------------------- | ------------------------------------------ |
| T-41-1 | Las migraciones se aplican antes de los tests      | sin pasos manuales                         |
| T-41-2 | Cada test arranca con la base limpia               | un test que inserta no afecta al siguiente |
| T-41-3 | Sin `DATABASE_URL` sigue saltándose con aviso      | no se rompe lo de M0                       |
| T-41-4 | CI aplica las migraciones en el job de integración | DoD del hito                               |

### 4.5 Seed (#42)

| ID     | Caso                                | Verificación                                |
| ------ | ----------------------------------- | ------------------------------------------- |
| T-42-1 | Crea una fila por singleton ausente | seis singletons → seis filas                |
| T-42-2 | Es idempotente                      | ejecutarlo dos veces no duplica             |
| T-42-3 | **No pisa borradores existentes**   | fila con draft modificado sobrevive         |
| T-42-4 | Aplica los `default` de la config   | `visible: true` presente en el draft creado |

## 5. Definition of Done de M1

1. El `cms.config.ts` de ejemplo produce esquemas Zod y tipos correctos (T-38-_, T-39-_).
2. Las migraciones aplican en CI (T-40-1, T-41-4).
3. Todos los casos de §4 pasan. Un caso puede posponerse con issue; ninguno puede darse por
   bueno estando en rojo.
4. `docs/PROGRESS.md` cierra M1 con qué funciona, qué es frágil y qué probar a mano.

## 6. Decisiones que exigen ADR

- **ADR-200** — Driver dual: Neon HTTP en producción, `node-postgres` en test y desarrollo.
- **ADR-201** — Sin extensión `citext`: unicidad por índice sobre `lower(email)`.
- **ADR-202** — Regla de presencia (`required` / `default` / opcional) y su efecto en los
  dos esquemas.
