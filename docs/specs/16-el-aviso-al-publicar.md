# 16 — El aviso al publicar

> Escrita **antes** del código. Los casos de la sección 7 son la definición de "hecho".
>
> Esta fase cierra un hueco que el repositorio ya tenía **escrito como hueco** en dos sitios:
> [`docs/DEVELOPER.md`](../DEVELOPER.md) («Lo que NO se lleva la web remota: el aviso al
> publicar») y [`08-vista-previa-remota.md`](08-vista-previa-remota.md) §3 («el aviso a la web
> destino cuando se publica —un webhook— es otro problema y otra fase»). Es esa fase.

## 1. Qué se pide

Que el CMS **avise** a la web que alimenta cuando lo publicado cambia, y que le diga **qué parte**
ha cambiado. Para que esa web pueda cachear lo publicado y volver a pedir **solo cuando llega el
aviso, y solo lo que el aviso nombra**.

Hoy no puede. `publish` invalida nuestra caché con `revalidateTag` y ahí se acaba: una web que
vive fuera se entera cuando le toque volver a preguntar. Así que hoy solo tiene dos opciones, y
las dos son malas:

| Lo que puede hacer hoy una web remota | Lo que le cuesta                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| No cachear (lo que hace el ejemplo)   | Una petición al CMS **por visita**. Es lo que `examples/web-remota/README.md` dice que no se copie |
| Cachear con un tiempo fijo            | Publicar parece no hacer nada durante ese tiempo. El editor pulsa, mira, y no ha cambiado          |

El aviso es lo que permite la tercera: **cachear indefinidamente y revalidar cuando se te dice**.

## 2. Las cuatro decisiones tomadas antes de diseñar

| Pregunta                          | Respuesta                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| ¿Dónde se configura el destino?   | **Variables de entorno.** Ni pantalla de ajustes ni varios destinos (ADR-1000)                     |
| ¿Un aviso por entrada o agrupado? | **Uno con la lista de claves.** `publishAll` de 100 entradas manda **un** POST, no 100 (ADR-1002)  |
| ¿Qué pasa si el aviso falla?      | **Publicar no falla.** El fallo se audita y el panel lo enseña. Un reintento, sin cola (ADR-1003)  |
| ¿Qué acciones avisan?             | Publicar, borrar y reordenar; los ajustes; y los medios. Cada uno con lo que de verdad puede decir |

## 3. Fuera de alcance

- **Varios destinos.** Uno. Sigue siendo un despliegue, una web (ADR-921 no se toca).
- **Configurarlo desde el panel.** ADR-1000 dice por qué, y no es comodidad.
- **Una cola con reintentos diferidos.** Un reintento inmediato y se acabó. La cola —tabla de
  salida más un cron— es una fase entera y va a [`PENDIENTES.md`](../PENDIENTES.md), no aquí.
- **Garantizar el orden ni la entrega.** No hay «exactamente una vez». §5.4 dice qué se hace en su
  lugar y por qué es suficiente.
- **Repintar la web de destino.** Lo mismo que ya fija ADR-701: entregamos el aviso, y qué hacer
  con él lo decide cada web.
- **Avisar de borradores.** El aviso sale de **publicar**. Un borrador no cambia nada de lo que la
  web puede pedir, y para verlo en vivo ya está la vista previa.

## 4. La trampa que hay que resolver, o esta fase no sirve de nada

`GET /api/content/:key` responde con `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.

Eso es la **CDN delante de nuestro despliegue**, no la caché de datos de Next. `revalidateTag` no
la toca. Así que sin hacer nada más, la secuencia sería esta:

1. Alguien publica. El CMS manda el aviso, y llega en menos de un segundo.
2. La web remota, obediente, vuelve a pedir `/api/content/hero`.
3. **La CDN le devuelve la copia de hace cuarenta segundos.**
4. La web concluye que el webhook no sirve, y quien lo montó tarda una tarde en saber por qué.

Un aviso que entrega eso es peor que no tener aviso: hace perder el tiempo prometiendo lo que no
cumple. La solución está en §5.3 y es la razón de que el sobre lleve un campo `ts`.

## 5. Contratos

### 5.1 Cómo se enciende

Dos variables de entorno, las dos obligatorias:

```sh
WEBHOOK_URL=https://mi-web.com/api/unocms   # a dónde va el POST
WEBHOOK_SECRET=...más de treinta y dos caracteres...
```

**Sin las dos, esta fase no existe**: no sale ni una petición, no se audita nada, y publicar tarda
exactamente lo que tarda hoy. Es la misma forma de encenderse que `PREVIEW_ORIGINS` (spec 08 §4.1)
y que el almacén local (ADR-700): una funcionalidad que se apaga **entera**, no una que se degrada.

Cuatro reglas de validación, y las cuatro apagan la fase entera si no se cumplen:

| Regla                                                              | Por qué                                                                                                                                      |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Las dos variables, o ninguna                                       | Media configuración funcionando y la otra media callada es peor. Mismo criterio que la lista de `PREVIEW_ORIGINS`, que se descarta entera    |
| `WEBHOOK_URL` absoluta y **`https`**                               | El sobre lleva qué secciones tiene la web y cuándo se tocan. Por `http` eso viaja legible para cualquiera en el camino                       |
| Salvo bucle local (`localhost`, `127.0.0.1`), donde `http` sí vale | Es el caso de probarlo con `examples/web-remota` en la máquina de uno. El bucle local no sale a la red                                       |
| `WEBHOOK_SECRET` de 32 caracteres o más                            | Es la única prueba que tiene la web de destino de que el aviso viene de nosotros. Uno corto se adivina, y entonces cualquiera puede avisarla |

**Y si algo de eso falla, se dice por consola al arrancar.** Una fase apagada en silencio por una
`https` mal escrita es exactamente el diagnóstico que cuesta una tarde.

### 5.2 El sobre

`POST` a `WEBHOOK_URL`, con `Content-Type: application/json`, y estas cabeceras:

| Cabecera          | Contenido                                       |
| ----------------- | ----------------------------------------------- |
| `X-UnoCMS-Evento` | El nombre del evento, repetido fuera del cuerpo |
| `X-UnoCMS-Id`     | Identificador único del aviso                   |
| `X-UnoCMS-Ts`     | Milisegundos desde la época                     |
| `X-UnoCMS-Firma`  | `sha256=<hex>`, ver §5.5                        |
| `User-Agent`      | `UnoCMS/1 (aviso)`                              |

El cuerpo:

```json
{
  "id": "e2a1…",
  "evento": "content.published",
  "ts": 1757404800123,
  "claves": [
    { "key": "hero", "tipo": "singleton" },
    { "key": "testimonials.a1b2", "tipo": "item", "coleccion": "testimonials" }
  ],
  "tags": ["content:hero", "content:testimonials"]
}
```

Y un campo más, **solo en los eventos que lo tienen** (#285):

```json
{ "evento": "media.deleted", "claves": [], "tags": [], "datos": { "url": "https://…/foto.webp" } }
```

`datos` va aparte y no como un campo suelto al nivel de `id` o `ts` porque el resto de eventos no
lo tienen, y un campo que a veces está y a veces no, mezclado con los que siempre están, invita a
leerlo sin comprobar.

Dos campos que parecen redundantes y no lo son:

- **`claves`** dice exactamente qué se tocó, elemento por elemento. Sirve para registrar y para
  decidir con detalle.
- **`tags`** es esa misma lista ya **deduplicada y elevada a lo que hay que volver a pedir**. Un
  elemento de colección se publica solo, pero lo que la web pide es la colección entera: `tags`
  ya trae `content:testimonials` y no `content:testimonials.a1b2`. Es el fallo de
  [#116](https://github.com/KthArg/uno-cms/issues/116) —invalidar el elemento y dejar la lista sin
  enterarse— en su versión hacia fuera, y se resuelve donde se resolvió aquella: al componer.

`tags` usa el mismo formato que `contentTag()`, para que una web hecha en Next pueda pasarlos a
`revalidateTag` sin traducir nada.

### 5.3 Cómo se vuelve a pedir sin chocar con la CDN

**El receptor pide `/api/content/<key>?v=<ts del aviso>`.**

Una query distinta es una entrada de caché distinta, así que esa petición no acierta en la copia
vieja y llega al origen. La ruta **ignora** el parámetro: solo lee `key`, así que la respuesta es
idéntica byte a byte a la de siempre.

Por qué así y no bajando el `s-maxage`:

- Bajarlo a cero castiga a **todas** las visitas de todas las webs para arreglar un caso que solo
  ocurre justo después de publicar. La caché de un minuto está ahí porque sirve.
- Mandar `Cache-Control: no-cache` en la **petición** no vale: la CDN sirve por la cabecera de la
  respuesta, no por lo que pida el cliente.
- Purgar la CDN por API sería atarnos a un proveedor concreto.

Y es también lo que hace que un aviso que llegue **desordenado** no haga daño: un `?v=` viejo
tampoco acierta en caché, así que trae el dato de ahora. Ver §5.4.

### 5.4 Qué se promete de la entrega, dicho sin adornos

**No hay entrega garantizada, ni orden, ni «exactamente una vez».** Se manda un POST; si falla, se
reintenta una vez; si vuelve a fallar, se audita y se acabó. Lo que sí se promete:

- **Cada aviso lleva `id`, y el reintento lleva el mismo.** Así el receptor puede descartar el
  duplicado en vez de revalidar dos veces.
- **Cada aviso lleva `ts`.** Sirve para la ventana anti-replay del receptor y para el `?v=`.
- **Volver a pedir es idempotente.** Dos avisos aplicados dos veces, o al revés, dejan a la web
  con lo publicado de ahora. Por eso no hace falta más maquinaria de la que hay.

Lo que **no** se promete, y hay que saberlo antes de montarlo: si el destino está caído los dos
intentos, ese cambio no se avisa nunca. La web se quedará con lo viejo hasta la siguiente
publicación. **La cola con reintentos diferidos es lo que arregla eso, y no está en esta fase.**

### 5.5 La firma, y por qué no usa `APP_SECRET`

`X-UnoCMS-Firma: sha256=<hex>` es `HMAC-SHA256(WEBHOOK_SECRET, "<ts>.<cuerpo>")`, en hexadecimal,
sobre el cuerpo **exactamente como se envía**.

Va el `ts` dentro de lo firmado para que quien recibe pueda rechazar un aviso reproducido: si el
`ts` no estuviera firmado, se podría reenviar un aviso capturado cambiándole la fecha.

**Y usa un secreto propio, no `APP_SECRET`, y esto no es una preferencia.** `APP_SECRET` firma los
tokens de vista previa, los de bootstrap y los de reinicio de contraseña (`cms/security/tokens.ts`).
Dárselo a la web de destino para que verifique avisos le daría, de regalo, la capacidad de
**fabricar un token de setup**. El secreto del aviso vive fuera de la casa por diseño; el otro no
sale de aquí.

### 5.6 Los eventos, y qué puede decir cada uno de verdad

| Evento              | Lo dispara              | `claves` | `tags`                | Nota                                                    |
| ------------------- | ----------------------- | -------- | --------------------- | ------------------------------------------------------- |
| `content.published` | `publish`, `publishAll` | Sí       | `content:<clave>`     | Solo lo que **cambió de verdad**                        |
| `content.deleted`   | `deleteItem`            | Sí       | `content:<coleccion>` |                                                         |
| `content.reordered` | `reorderItems`          | Sí       | `content:<coleccion>` |                                                         |
| `settings.updated`  | `updateSettings`        | No       | `settings`            | Exige el endpoint de §5.7, o avisaría de algo impedible |
| `media.uploaded`    | subir una imagen        | No       | **ninguno**           | No cambia nada publicado. Ver abajo                     |
| `media.deleted`     | `deleteMedia`           | No       | **ninguno**           | Lleva la URL que dejó de existir                        |

Tres cosas que hay que leer despacio:

1. **`publish` sin cambios no avisa.** `publishEntry` ya devuelve `cambio: false` cuando el
   borrador y lo publicado coinciden, y la auditoría lo distingue desde ADR-407. Avisar ahí sería
   despertar a la web de destino por pulsar «Publicar» dos veces seguidas.
2. **`media.uploaded` va sin `tags` a propósito, y es discutible.** Subir una imagen no cambia una
   sola respuesta de la API pública: nada la referencia hasta que alguien la use en un contenido y
   lo publique, y eso ya manda `content.published`. Se manda igual porque hay webs que quieren
   saberlo —para precalentar su propia caché de imágenes—, pero **sin `tags`, para que un receptor
   que solo revalida contenido lo ignore solo** en vez de repedirlo todo para nada.
3. **`media.deleted` sí importa aunque tampoco cambie el contenido publicado**: una URL que estaba
   sirviendo bytes deja de servirlos, y una web que los cachea querrá enterarse.

### 5.7 Los ajustes pasan a tener endpoint público

`GET /api/settings`, pública y sin CORS, **con el mismo criterio que `/api/content/:key`**:

```json
{
  "site": { "siteName": "…" },
  "seo": { "defaultTitle": "…", "defaultDescription": "…", "ogImageUrl": "…" }
}
```

Existe **porque esta fase avisa de los ajustes**, y avisar de algo que la web no puede pedir es un
aviso vacío. `docs/DEVELOPER.md` decía «los ajustes del sitio y el SEO por defecto siguen sin
endpoint público»; esta fase lo cambia y hay que enmendar esa línea.

**Devuelve `site` y `seo`, y nada más. Nunca `setup_completed`.** No es por limpieza: ese ajuste
dice si el bootstrap sigue abierto, y `/setup` responde 404 justo para no decirlo. Sacarlo por una
ruta pública anularía esa protección desde la ruta de al lado.

Los valores son los **efectivos**, los mismos que usa el layout: con sus valores por defecto ya
aplicados y pasados por su esquema, tal y como los devuelve `readSettings` (ADR-404).

### 5.8 Cuándo se manda, dentro de la acción

Después de escribir y **fuera de la transacción**, igual que `revalidateTag` (SPEC §5.3), y
mandado con `after()` de Next: el aviso no se pone por delante de la respuesta al editor, que ya
tiene su cambio guardado y no debería esperar a una red que no es la suya.

Cada intento, `AbortSignal.timeout(2000)`. Un reintento, y solo si el fallo puede ser transitorio:

| Respuesta del destino | ¿Se reintenta? | Por qué                                                                                          |
| --------------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| Red caída, timeout    | **Sí**         | Es lo que un reintento arregla                                                                   |
| 5xx                   | **Sí**         | Un fallo del otro lado que puede pasarse solo                                                    |
| 4xx                   | **No**         | Su configuración está mal —firma, ruta, secreto—. Repetir no la arregla, y le duplica el trabajo |

El resultado se audita siempre: `webhook.enviado` con el código, o `webhook.fallido` con el motivo
y el número de intentos. Nunca el secreto ni la firma — `audit` ya redacta toda clave que contenga
`secret` o `token`, pero **no se le pasan de todas formas**, porque depender de un filtro para algo
que se puede no meter es fiar la seguridad a una lista que alguien puede acortar.

## 6. Lo que NO cambia, y hay que comprobarlo

- **`GET /api/content/:key` sigue sin cabeceras CORS** (T-R-14) y sigue devolviendo solo lo
  publicado (T-R-13). Esta fase no le añade nada.
- **`revalidateTag` se sigue llamando exactamente igual.** La landing de este repositorio no se
  entera de que existe esta fase.
- **Con la fase apagada, publicar hace lo mismo que hoy**, sin una petición saliente ni un `after`
  colgado.
- **Ninguna acción cambia su resultado.** Un aviso que falla no convierte un `ok` en un fallo.

## 7. Casos de prueba — la definición de "hecho"

### 7.1 El interruptor

| Caso  | Qué comprueba                                                                    |
| ----- | -------------------------------------------------------------------------------- |
| T-A-1 | Sin ninguna de las dos variables, publicar **no hace ninguna petición saliente** |
| T-A-2 | Con una sola de las dos, la fase queda apagada **y el motivo sale por consola**  |
| T-A-3 | Una `WEBHOOK_URL` `http` que no es bucle local apaga la fase                     |
| T-A-4 | `http://localhost:…` **sí** vale                                                 |
| T-A-5 | Un `WEBHOOK_SECRET` de menos de 32 caracteres apaga la fase                      |

### 7.2 La firma

| Caso   | Qué comprueba                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------- |
| T-A-6  | La firma es HMAC-SHA256 de `"<ts>.<cuerpo>"` y el cuerpo firmado es **byte a byte** el enviado |
| T-A-7  | Cambiar un solo byte del cuerpo hace que el verificador la rechace                             |
| T-A-8  | Cambiar el `ts` de la cabecera sin refirmar también la rechaza                                 |
| T-A-9  | La misma firma **no** se obtiene con `APP_SECRET`                                              |
| T-A-10 | Ni el secreto ni la firma llegan a la auditoría ni a la consola                                |

### 7.3 Qué se avisa

| Caso   | Qué comprueba                                                                              |
| ------ | ------------------------------------------------------------------------------------------ |
| T-A-11 | `publish` de un singleton manda `content.published` con esa clave y `content:<clave>`      |
| T-A-12 | `publish` de un elemento de colección manda el tag de **la colección**, no el del elemento |
| T-A-13 | `publish` que no cambia nada (`changed: false`) **no manda nada**                          |
| T-A-14 | `publishAll` de N entradas manda **un** aviso con N claves, no N avisos                    |
| T-A-15 | `deleteItem` y `reorderItems` avisan con el tag de la colección                            |
| T-A-16 | `media.uploaded` y `media.deleted` van **sin `tags`**                                      |
| T-A-17 | `settings.updated` lleva `settings` y **ninguna** clave de contenido                       |
| T-A-18 | Las claves del aviso son solo las declaradas en `cms.config.ts`                            |

### 7.4 La entrega

| Caso   | Qué comprueba                                                                |
| ------ | ---------------------------------------------------------------------------- |
| T-A-19 | Un destino que responde 500 **no** impide que la publicación quede escrita   |
| T-A-20 | Un destino que no responde nunca **no** cuelga la publicación                |
| T-A-21 | Un fallo de red se reintenta una vez, y el reintento lleva **el mismo `id`** |
| T-A-22 | Un 4xx **no** se reintenta                                                   |
| T-A-23 | El resultado se audita: `webhook.enviado` con el código o `webhook.fallido`  |
| T-A-24 | Dos avisos seguidos llevan `id` distintos                                    |

### 7.5 Que no se rompa lo de siempre

| Caso   | Qué comprueba                                                                |
| ------ | ---------------------------------------------------------------------------- |
| T-A-25 | Con la fase encendida, `revalidateTag` se sigue llamando con los mismos tags |
| T-A-26 | `GET /api/content/:key` sigue sin CORS y sigue devolviendo solo lo publicado |
| T-A-27 | Con la fase apagada, no se programa ningún `after`                           |

### 7.6 El caché de la CDN

| Caso   | Qué comprueba                                                    |
| ------ | ---------------------------------------------------------------- |
| T-A-28 | `GET /api/content/hero?v=<ts>` devuelve **lo mismo** que sin `v` |
| T-A-29 | Y con la **misma** cabecera `Cache-Control`                      |

### 7.7 Los ajustes por API

| Caso   | Qué comprueba                                                         |
| ------ | --------------------------------------------------------------------- |
| T-A-30 | `GET /api/settings` devuelve `site` y `seo` con sus valores efectivos |
| T-A-31 | **Nunca** devuelve `setup_completed`, ni con el setup sin completar   |
| T-A-32 | Sigue sin cabeceras CORS, igual que `/api/content/:key`               |
| T-A-33 | Está declarada en `ACCESO_DECLARADO` con su motivo                    |

### 7.8 El panel lo enseña

| Caso   | Qué comprueba                                              |
| ------ | ---------------------------------------------------------- |
| T-A-34 | Con la fase apagada, el panel no enseña nada del aviso     |
| T-A-35 | Con la fase encendida, enseña el último resultado y cuándo |
| T-A-36 | Un fallo se ve **como fallo**, no como «todavía sin datos» |

### 7.9 La web de ejemplo, que es la prueba de que el contrato se puede seguir

| Caso   | Qué comprueba                                                                       |
| ------ | ----------------------------------------------------------------------------------- |
| T-A-37 | El receptor rechaza una firma inválida, y responde igual que a un cuerpo manipulado |
| T-A-38 | Rechaza un aviso con `ts` fuera de la ventana de cinco minutos                      |
| T-A-39 | Un aviso repetido con el mismo `id` no revalida dos veces                           |
| T-A-40 | Al recibirlo, pide **solo** las claves del aviso, y con `?v=<ts>`                   |
| T-A-41 | **Sin aviso, no pide nada**: sirve lo que tiene cacheado                            |

> **T-A-41 es el caso que justifica la fase entera.** Si sobrevive a que se rompa la caché del
> receptor, no estaba probando nada.

## 8. En qué piezas se corta

Cinco issues, cada uno con su rama y su PR. El orden importa: el primero es el único que los
demás necesitan.

| Issue | Alcance                                                                    | Casos           |
| ----- | -------------------------------------------------------------------------- | --------------- |
| 1     | El núcleo: configuración, sobre, firma, entrega, auditoría, y el contenido | T-A-1 … T-A-29  |
| 2     | Los ajustes tienen endpoint público, y por eso pueden avisar               | T-A-30 … T-A-33 |
| 3     | Los avisos de medios                                                       | T-A-16          |
| 4     | El panel enseña el último aviso                                            | T-A-34 … T-A-36 |
| 5     | La web de ejemplo cachea y revalida de verdad                              | T-A-37 … T-A-41 |

## 9. Lo que exige ADR

| ADR      | Qué decide                                                                     |
| -------- | ------------------------------------------------------------------------------ |
| ADR-1000 | El destino se configura por entorno y no desde el panel                        |
| ADR-1001 | La firma usa un secreto propio y no `APP_SECRET`                               |
| ADR-1002 | Un aviso agrupado con la lista de claves, y `tags` ya elevados a la colección  |
| ADR-1003 | Publicar no falla porque el aviso falle; un reintento y sin cola               |
| ADR-1004 | El `?v=` del aviso, y por qué no se baja el `s-maxage`                         |
| ADR-1005 | Los ajustes salen por API, sin `setup_completed`, y `DEVELOPER.md` se enmienda |
