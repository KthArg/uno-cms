# 17 — Idiomas

> Escrita **antes** del código. Los casos de la sección 7 son la definición de "hecho".
>
> Saca del backlog el punto 5 de SPEC §10, «i18n de contenido» (issue
> [#14](https://github.com/KthArg/uno-cms/issues/14)). Por eso lleva ADR propio y enmienda la §10:
> pasar algo de «fuera de alcance» a «dentro» no se hace en silencio.

## 1. Qué se pide

Que **un mismo despliegue** pueda servir la landing en varios idiomas, y que cada idioma se
**alimente por separado**: su borrador, su publicación, su historial y sus listas. La referencia
es la de Strapi: quien edita elige el idioma, trabaja en él, y publicar en inglés no toca nada de
lo que está publicado en español.

Hoy no se puede. `content_entries.key` es único, así que `hero` existe una vez; la API no tiene
dónde decir el idioma; y el `<html lang="es">` está escrito a mano. Lo único que se puede hacer
es declarar `hero_es` y `hero_en` como secciones distintas, y eso duplica el formulario, no deja
agrupar nada en el panel y obliga a quien monta la landing a inventarse la convención.

## 2. Las decisiones tomadas antes de diseñar

| Pregunta                                                                 | Respuesta                                                                                                      |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| ¿Cada idioma se publica por separado?                                    | **Sí.** Borrador, publicación, versión e historial propios por idioma. Es lo que se pidió (ADR-1101)           |
| ¿Las listas comparten elementos entre idiomas?                           | **No.** Cada idioma tiene su lista, con sus elementos y su orden. Un testimonio en inglés no existe en español |
| ¿Si un idioma no tiene algo publicado, se rellena con el de por defecto? | **No.** Leer un idioma devuelve lo de ese idioma y nada más (ADR-1101)                                         |
| ¿Cómo se guarda el idioma?                                               | Columna `locale`, con **`''` para el idioma por defecto** (ADR-1100)                                           |
| ¿Cómo elige el panel en qué idioma se trabaja?                           | Un selector en la cabecera que se recuerda en una cookie, como el tema (ADR-1102)                              |
| ¿«Publicar todo» publica todos los idiomas?                              | **No.** Solo el idioma que se está mirando (ADR-1102)                                                          |
| ¿Hay campos compartidos entre idiomas?                                   | **No en esta fase.** Para no rehacer las imágenes, hay «Rellenar desde <idioma por defecto>» en los singletons |

## 3. Fuera de alcance

- **Campos compartidos entre idiomas** (el «no se traduce» de Strapi). Exige sincronizar filas al
  guardar y decidir qué pasa con un borrador a medias en otro idioma. Va a
  [`PENDIENTES.md`](../PENDIENTES.md).
- **Rellenar una lista desde otro idioma.** Los elementos no están enlazados entre idiomas, así que
  copiar una lista entera es otra operación con sus propias preguntas. A `PENDIENTES.md`.
- **Permisos por idioma** (un traductor que solo puede tocar el inglés). Los roles siguen siendo
  dos, los de §7.1.
- **Ajustes por idioma.** `siteName` y los ajustes de `settings` son del sitio, no de un idioma. El
  SEO de la landing **sí** se traduce, porque vive en el singleton `seo` de `cms.config.ts`.
- **Traducir el panel.** El panel sigue en español; lo que cambia de idioma es el contenido.
- **Detectar el idioma del visitante** por `Accept-Language`. La landing sirve el que pide la URL.
- **Que la web remota de ejemplo hable varios idiomas.** Sigue pidiendo el de por defecto; el
  contrato para pedir otro está en §5.5 y basta con añadir el parámetro.

## 4. La trampa que hay que resolver

**Activar idiomas en un sitio que ya tiene contenido no puede perderlo.** Si el idioma se guardara
con su código (`'es'`), la migración tendría que saber cuál es el idioma por defecto de **cada**
despliegue para rellenar las filas que ya existen, y la migración es SQL: no lee `cms.config.ts`.
Habría que elegir entre una migración que adivina y un paso a mano después de desplegar.

Y hay una segunda versión de la misma trampa: quien cambia el idioma por defecto de `es` a `pt`
—porque se equivocó, o porque el sitio cambia de mercado— dejaría todo su contenido apuntando a un
idioma que ya no es el principal.

Las dos se resuelven igual: **el idioma por defecto no se guarda con su código, se guarda como
`''`**. Las filas que existen hoy ya son del idioma por defecto sin tocarlas, y el código del
idioma principal es una etiqueta que se puede cambiar en `cms.config.ts` sin migrar nada.
ADR-1100 dice qué se paga por ello.

## 5. Contratos

### 5.1 Cómo se declara

```ts
export default defineConfig({
  siteName: 'Mi Empresa',
  idiomas: [
    { codigo: 'es', nombre: 'Español' }, // el primero es el de por defecto
    { codigo: 'en', nombre: 'English' },
  ],
  singletons: { … },
  collections: { … },
});
```

`idiomas` es **opcional**. Sin él, el sitio tiene un idioma, `{ codigo: 'es', nombre: 'Español' }`,
y se comporta exactamente como hoy: ni selector en el panel, ni rutas nuevas en la landing.

El nombre del campo va en español porque lo añadimos nosotros; la regla está en `CLAUDE.md` §7.

`defineConfig` lo valida al arrancar y lanza `ConfigError` si:

| Regla                                                                      | Por qué                                                                                      |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| La lista está vacía                                                        | Un sitio sin idioma no tiene nada que servir                                                 |
| Un `codigo` no es `xx`, `xxx` o `xx-XX` (`es`, `ast`, `pt-BR`)             | Va en la URL de la landing y en el atributo `lang`. Cualquier otra cosa rompe una de las dos |
| Un `codigo` se repite                                                      | Dos idiomas con el mismo código son el mismo idioma con dos nombres                          |
| Un `codigo` choca con una ruta propia (`admin`, `api`, `preview`, `setup`) | `/<codigo>` es la ruta de la landing en ese idioma (§5.6)                                    |
| Un `nombre` está vacío                                                     | Es lo que ve el editor en el selector                                                        |

### 5.2 Dónde vive el idioma en la base de datos

`content_entries` y `revisions` ganan una columna:

```ts
locale: text('locale').notNull().default('');
```

- `''` es el idioma por defecto (§4, ADR-1100). Cualquier otro valor es el `codigo` de §5.1.
- El índice único de `content_entries` pasa de `(key)` a **`(key, locale)`**: `hero` existe una
  vez por idioma.
- Los elementos de lista siguen teniendo clave `coleccion.<uuid>`, distinta en cada idioma.
- `revisions` filtra por `(entry_key, locale)`: el historial del inglés no enseña lo publicado en
  español.

La traducción entre `codigo` y columna vive en **un solo sitio**, `cms/core/idiomas.ts`. Ninguna
otra parte del código escribe `''` a mano.

### 5.3 Las actions

Todas las que hoy reciben una clave o una colección aceptan **`idioma?: string`**, el `codigo` de
§5.1. Sin él, el idioma por defecto: así siguen funcionando igual todas las llamadas de hoy.

`saveDraft`, `publish`, `revertDraft`, `restoreRevision`, `createItem`, `deleteItem`,
`reorderItems`, `publishAll`, `createPreviewToken` y `crearTokenDeVistaPreviaRemota`.

Un `idioma` que no está en §5.1 responde `NOT_FOUND` con un mensaje que lo dice, **antes** de
tocar la base de datos. Es una entrada del cliente: si se aceptara cualquier código, bastaría con
inventarse uno para crear filas que no se ven desde ningún sitio.

Y una nueva, solo para singletons:

```ts
rellenarDesdeIdiomaPorDefecto({ key, idioma, version }) → { version }
```

Copia el **borrador** del idioma por defecto sobre el borrador del idioma pedido, como si el editor
lo hubiera escrito: sube la versión, deja el estado en `changed` y **no publica**. Respeta el
bloqueo optimista igual que `saveDraft`. Pedirla para el idioma por defecto o para un elemento de
lista responde `CONFLICT`.

### 5.4 La lectura pública

```ts
getContent('hero', 'en'); // segundo argumento opcional; sin él, el de por defecto
getCollection('faqs', 'en');
```

- Devuelve **lo publicado en ese idioma** y nada más. Sin fallback al de por defecto (ADR-1101):
  un idioma a medio traducir se ve a medio traducir, en vez de mezclar dos idiomas en la misma
  página sin que nadie lo haya decidido.
- La caché se separa por idioma —la clave de `unstable_cache` lleva el código— y **el tag no
  cambia**: `content:hero` invalida todos los idiomas de `hero`. Invalida de más, y es a propósito:
  publicar es raro y un tag por idioma obligaría a cada web remota a saber de idiomas para
  invalidar bien.
- Un idioma desconocido **lanza**. No es un caso del visitante —la ruta ya lo ha filtrado— sino un
  error de quien monta la landing, y ADR-404 («leer no lanza») habla del contenido, no de las
  llamadas mal escritas.

### 5.5 La API

```
GET /api/content/hero?idioma=en
→ 200 { "key": "hero", "idioma": "en", "data": { … } }
```

- Sin `idioma`, el de por defecto. La respuesta lleva **siempre** el campo `idioma` con el código
  que se ha servido, también cuando no se pidió: quien la lea no tiene que saber cuál es el de por
  defecto.
- Un `idioma` que no está en §5.1 responde **400** `{ "error": "idioma_desconocido" }`. No un 404:
  la clave existe, lo que está mal es la pregunta.
- La `Cache-Control` es la misma. Con `?idioma=` la URL es otra, así que la CDN ya guarda una
  copia por idioma sin hacer nada más.

### 5.6 La landing

| URL                       | Qué sirve                                                                |
| ------------------------- | ------------------------------------------------------------------------ |
| `/`                       | El idioma por defecto, como hoy                                          |
| `/en`                     | El idioma `en`, si está declarado                                        |
| `/es` (el de por defecto) | Redirección permanente a `/`. Dos URLs con la misma página parten el SEO |
| `/xx` desconocido         | 404                                                                      |

- `<html lang>` lleva el código del **idioma por defecto**, sacado de `cms.config.ts` y no escrito a
  mano. El contenido de `/en` va dentro de un `<div lang="en">`: el `<html>` lo comparte el layout
  raíz con el panel, y saber la ruta ahí obligaría a volver dinámica cualquier página. El atributo
  `lang` en un elemento es HTML válido y los lectores de pantalla lo respetan.
- `sitemap.xml` lista una URL por idioma, cada una con sus alternativas (`hreflang`).
- Con un solo idioma, nada de esto existe: `/` y nada más.

### 5.7 La vista previa

El token de vista previa lleva **el idioma dentro**, firmado, igual que lleva la clave. Un token de
`hero` en inglés no enseña el borrador de `hero` en español. La vista previa compone la página con
el borrador de esa entrada **en ese idioma** y lo publicado del resto **en ese mismo idioma**.

Un token firmado antes de esta fase no lleva idioma, y se lee como del idioma por defecto: es lo
que era.

### 5.8 El aviso

Cada clave de `claves` gana el campo **`idioma`** con el código:

```json
{ "key": "hero", "tipo": "singleton", "idioma": "en" }
```

`tags` no cambia (§5.4). Es un campo añadido, así que una web que reciba el aviso y no sepa de
idiomas sigue funcionando: vuelve a pedir `content:hero` y se lleva el de por defecto, que es lo
que pedía.

### 5.9 El panel

- **Selector de idioma** en la cabecera, solo si hay más de uno. Se guarda en la cookie
  `unocms_idioma`, como el tema (`cms/tema.ts`), y por el mismo motivo: el servidor sabe qué idioma
  toca al componer la página.
- Cada pantalla de edición, lista e historial lleva **una etiqueta con el idioma** («Editando en
  English»). Quien edita en dos pestañas tiene que poder ver en cuál está.
- **El idioma de cada acción se fija al componer la página, no al pulsar.** Las server actions de
  la página lo llevan cerrado en su ámbito. Si en otra pestaña se cambia el selector, lo que se
  escribe desde esta sigue yendo al idioma que enseña su etiqueta.
- El inicio cuenta y lista **las secciones del idioma elegido**, y «Publicar todo» publica solo
  ese idioma.
- En un singleton de un idioma que no es el de por defecto aparece **«Rellenar desde Español»**,
  con confirmación, porque sustituye lo que haya escrito.

## 6. Lo que NO cambia, y hay que comprobarlo

- Un sitio **sin** `idiomas` en `cms.config.ts` no ve nada nuevo: ni selector, ni etiqueta, ni rutas,
  y todas las suites de antes pasan sin tocarlas.
- Las filas que ya existían son del idioma por defecto **sin migración de datos**.
- `GET /api/content/:key` sin `idioma` responde lo mismo que hoy, más el campo `idioma`.
- Un aviso de un sitio con un solo idioma lleva `idioma` con ese código, y los mismos `tags`.

## 7. Casos de prueba — la definición de "hecho"

### 7.1 La configuración

| Caso   | Qué comprueba                                                                              |
| ------ | ------------------------------------------------------------------------------------------ |
| T-ID-1 | Sin `idiomas`, el sitio tiene uno, `es`, y es el de por defecto                            |
| T-ID-2 | El primero de la lista es el de por defecto                                                |
| T-ID-3 | `defineConfig` rechaza una lista vacía, un código repetido y un nombre vacío               |
| T-ID-4 | Rechaza códigos mal formados (`EN`, `english`, `es_ES`) y acepta `es`, `ast` y `pt-BR`     |
| T-ID-5 | Rechaza un código que choca con una ruta propia (`admin`, `api`, `preview`, `setup`)       |
| T-ID-6 | El idioma por defecto se guarda como `''` y los demás con su código, y la vuelta es exacta |

### 7.2 La base de datos

| Caso   | Qué comprueba                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------ |
| T-ID-7 | `hero` puede existir en `''` y en `en` a la vez, y dos `hero` en `en` chocan con el índice único |
| T-ID-8 | Una fila insertada sin `locale` es del idioma por defecto                                        |

### 7.3 Cada idioma va por su lado

| Caso    | Qué comprueba                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------- |
| T-ID-9  | `saveDraft` en `en` no cambia el borrador ni la versión de `hero` en español                                           |
| T-ID-10 | `publish` en `en` publica el inglés y deja lo publicado en español **exactamente** como estaba                         |
| T-ID-11 | Las revisiones de `publish` en `en` llevan `locale = 'en'`, y el historial de un idioma no enseña las del otro         |
| T-ID-12 | `revertDraft` y `restoreRevision` en `en` solo tocan el inglés, y restaurar una revisión de otro idioma es `NOT_FOUND` |
| T-ID-13 | `createItem` en `en` crea el elemento en la lista inglesa, con su orden contado **solo** en esa lista                  |
| T-ID-14 | `reorderItems` en `en` con una clave de la lista española es `NOT_FOUND`                                               |
| T-ID-15 | `deleteItem` en `en` no puede borrar un elemento de la lista española                                                  |
| T-ID-16 | `publishAll` en `en` publica lo pendiente en inglés y no toca lo pendiente en español                                  |
| T-ID-17 | Un `idioma` que no está en `cms.config.ts` es `NOT_FOUND` en todas las actions, sin escribir nada                      |
| T-ID-18 | Sin `idioma`, todas las actions trabajan sobre el de por defecto                                                       |

### 7.4 Rellenar desde el idioma por defecto

| Caso    | Qué comprueba                                                                         |
| ------- | ------------------------------------------------------------------------------------- |
| T-ID-19 | Copia el borrador español sobre el inglés, sube la versión y deja el estado `changed` |
| T-ID-20 | No publica: lo publicado en inglés sigue igual                                        |
| T-ID-21 | Con una versión vieja responde `VERSION_CONFLICT` y no copia nada                     |
| T-ID-22 | Para el idioma por defecto o para un elemento de lista responde `CONFLICT`            |

### 7.5 La lectura y la API

| Caso    | Qué comprueba                                                                                                         |
| ------- | --------------------------------------------------------------------------------------------------------------------- |
| T-ID-23 | `readContent('hero', 'en')` devuelve lo publicado en inglés, y sin nada en inglés, valores vacíos y **no** el español |
| T-ID-24 | `readCollection('faqs', 'en')` solo trae elementos de la lista inglesa, en su orden                                   |
| T-ID-25 | La clave de caché de `getContent` lleva el idioma y el tag sigue siendo `content:<key>`                               |
| T-ID-26 | `GET /api/content/hero?idioma=en` devuelve el inglés con `idioma: "en"`                                               |
| T-ID-27 | Sin `idioma`, devuelve el de por defecto con `idioma: "es"`                                                           |
| T-ID-28 | Un `idioma` desconocido es 400 `idioma_desconocido`                                                                   |
| T-ID-29 | Un idioma desconocido en `readContent` lanza                                                                          |

### 7.6 La landing

| Caso    | Qué comprueba                                                             |
| ------- | ------------------------------------------------------------------------- |
| T-ID-30 | `/en` enseña lo publicado en inglés dentro de un elemento con `lang="en"` |
| T-ID-31 | `/es`, siendo el de por defecto, redirige a `/`                           |
| T-ID-32 | `/xx` es 404                                                              |
| T-ID-33 | `<html lang>` es el código del idioma por defecto                         |
| T-ID-34 | `sitemap.xml` lista `/` y `/en`, con alternativas de idioma               |

### 7.7 La vista previa y el aviso

| Caso    | Qué comprueba                                                                                                                           |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| T-ID-35 | El token de vista previa lleva el idioma, y la vista previa de `hero` en `en` enseña el borrador inglés y lo publicado inglés del resto |
| T-ID-36 | Un token sin idioma se lee como del idioma por defecto                                                                                  |
| T-ID-37 | `publish` en `en` avisa con `idioma: "en"` en la clave y los mismos `tags` de siempre                                                   |
| T-ID-38 | `deleteItem` y `reorderItems` avisan con el idioma de la lista                                                                          |

### 7.8 El panel

| Caso    | Qué comprueba                                                                                                       |
| ------- | ------------------------------------------------------------------------------------------------------------------- |
| T-ID-39 | Con un solo idioma no hay selector ni etiqueta                                                                      |
| T-ID-40 | Con dos, el selector enseña los dos nombres y marca el actual                                                       |
| T-ID-41 | La etiqueta del editor dice el idioma en el que se está editando                                                    |
| T-ID-42 | «Rellenar desde Español» solo aparece en un singleton de un idioma que no es el de por defecto, y pide confirmación |
| T-ID-43 | Un idioma desconocido en la cookie se lee como el de por defecto                                                    |
| T-ID-44 | e2e: elegir English, editar la portada, publicar, y ver `/en` con el texto inglés y `/` con el español sin cambios  |

## 8. En qué piezas se corta

Va en **un PR**, porque las piezas no se sostienen solas: una columna sin actions que la filtren
deja el panel escribiendo en el idioma equivocado, y unas actions sin panel no se pueden probar a
mano. Dentro del PR, un commit por pieza:

1. `cms/core/idiomas.ts`, la configuración y su validación (§5.1).
2. La migración y el esquema (§5.2).
3. Lectura, caché y API (§5.4, §5.5).
4. Las actions, el aviso y la vista previa (§5.3, §5.7, §5.8).
5. El panel (§5.9).
6. La landing y el sitemap (§5.6).
7. Documentación: enmienda de SPEC §10, `DEVELOPER.md`, `PENDIENTES.md`, `PROGRESS.md`.

## 9. Lo que exige ADR

- **ADR-1100** — El idioma por defecto se guarda como `''`, no con su código.
- **ADR-1101** — Cada idioma va por su lado: sin fallback y sin elementos compartidos.
- **ADR-1102** — El panel elige idioma por cookie, cada página fija el suyo al componerse, y
  «Publicar todo» no cruza idiomas.
