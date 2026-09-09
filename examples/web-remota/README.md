# Una web alimentada por UnoCMS desde fuera

Esta carpeta es una web **que no vive en el CMS**: se despliega aparte, en su propio dominio, y
consume el contenido por la API. Es el caso de ADR-701 y su contrato está en
[`docs/DEVELOPER.md`](../../docs/DEVELOPER.md#alimentar-una-web-que-vive-fuera-de-este-repositorio).

**No es una demo bonita.** Está aquí porque cuando se cerró la vista previa remota, la fragilidad
número uno que quedó anotada era esta:

> Nadie ha integrado esto en una web de verdad. Todos los casos son nuestros dos lados hablando
> entre ellos.

Esto es esa integración, con tests que la sostienen. Si el contrato cambia y esta carpeta no,
`pnpm test:unit` se pone rojo.

## Qué hace

- Pide **lo publicado** al CMS **desde su servidor** y lo pinta.
- **Lo cachea, y solo lo vuelve a pedir cuando el CMS avisa** — y solo la parte que el aviso
  nombra (issue #287).
- En vista previa, carga el cliente del CMS y se actualiza en vivo mientras alguien escribe en el
  panel.
- Nada más. Sin framework y sin una sola dependencia: cuanto menos se parezca al CMS, mejor
  prueba es de que el contrato se puede seguir con cualquier cosa.

## La trampa que este ejemplo existe para no propagar

**Lo publicado hay que pedirlo desde el servidor, no desde el navegador.**

`GET /api/content/:key` no manda cabeceras CORS, y es deliberado: es la ruta pública de siempre y
al abrir la vista previa remota no se le añadió nada (T-R-14). Así que un `fetch` a esa ruta desde
el navegador de quien visita la web **falla**, con un `Failed to fetch` que no dice por qué.

Lo desconcertante, si no se sabe, es que **la vista previa sí funciona desde el navegador**: esa
otra ruta sí manda CORS, con el origen exacto y un token. O sea que lo complicado va y lo sencillo
no, que es justo al revés de lo que espera cualquiera.

Por eso `lib/contenido.js` corre en el servidor y el `<script>` de la página no toca esa ruta. Hay
un caso que lo comprueba.

## Desplegarla

En Vercel, como un proyecto **aparte** del CMS:

1. **New Project** sobre este mismo repositorio.
2. **Root Directory**: `examples/web-remota`.
3. **Framework Preset**: `Other`.
4. Variable de entorno **`CMS_URL`**: la dirección de tu CMS, con protocolo y sin barra final.

No hay paso de construcción: `vercel.json` manda todas las direcciones a una función que compone
la página.

Y para que la vista previa en vivo funcione, en **el CMS**:

```
PREVIEW_ORIGINS=https://esta-web.vercel.app
PREVIEW_URL=https://esta-web.vercel.app/
```

## Probarla en local

```sh
CMS_URL=http://localhost:3000 npx vercel dev
```

Con `vercel dev` y no con un servidor propio a propósito: lo que hay que probar es lo que se
despliega, no una imitación.

## El aviso al publicar, y qué se puede copiar de aquí

Esta web **cachea lo publicado y solo vuelve a pedirlo cuando el CMS avisa**. Es lo que la versión
anterior de este README decía que haría una web de verdad, y no hacía.

El recorrido, entero:

1. Alguien publica en el CMS.
2. El CMS manda un `POST` firmado a `WEBHOOK_URL`, con los `tags` de lo que cambió.
3. `api/aviso.js` lo verifica y marca esas claves como pendientes en `lib/almacen.js`.
4. La siguiente visita pide **solo esas**, y con `?v=<ts>` para esquivar la CDN del CMS.
5. Cualquier otra visita se sirve del almacén, **sin tocar el CMS**.

Para que funcione, dos variables aquí (`WEBHOOK_SECRET`, el mismo del CMS) y dos en el CMS:

```sh
WEBHOOK_URL=https://esta-web.vercel.app/api/unocms
WEBHOOK_SECRET=...el mismo de los dos lados, 32 caracteres o más...
```

### La limitación grande, dicha antes de que la descubras

**El almacén es memoria del proceso, y en serverless hay más de un proceso.**

El aviso llega a **una** instancia. Las demás siguen sirviendo lo que tenían hasta que se apaguen.
Con poco tráfico suele haber una sola instancia caliente y esto se comporta como uno espera —
«suele» no es una garantía, y construir sobre «suele» es cómo se acaba con un fallo que solo
aparece los días buenos.

No se arregla con más código aquí: hace falta un sitio compartido, y este ejemplo no puede pedirte
una base de datos para enseñarte un contrato. Lo que se enseña es **la forma**: qué se guarda, qué
se invalida y cuándo se vuelve a pedir. El almacén es la pieza que cambias.

| Si tu web es… | Lo que pones en lugar de `lib/almacen.js`                                  |
| ------------- | -------------------------------------------------------------------------- |
| Next          | `revalidateTag(tag)` con los `tags` del aviso — ya vienen con ese formato  |
| Otra cosa     | Redis, KV, la caché de tu CDN… cualquier cosa que compartan las instancias |

### Y dos cosas que sí merece la pena copiar tal cual

**La verificación de `lib/aviso.js`.** Sin ella este endpoint es un amplificador: cualquiera en
internet obliga a tu web a repedirlo todo, tantas veces como quiera. Comprueba la firma en tiempo
constante, la ventana de cinco minutos contra reenvíos, y **decide con los campos del cuerpo, no
con las cabeceras** — `X-UnoCMS-Evento` y `X-UnoCMS-Id` están fuera de la firma.

**Que `api/aviso.js` use la firma Web (`Request`/`Response`) y no la de Node.** Es lo único que da
el **cuerpo crudo**, que es sobre lo que se calcula la firma. Con `(req, res)`, Vercel entrega el
JSON ya analizado y volver a serializarlo para verificar no funciona: `JSON.stringify` no promete
reproducir el mismo texto. Con esa firma esto no se puede hacer bien, solo parecerlo hasta el
primer sobre que se serialice distinto.

## Lo que no hace, y no es un descuido

- **No comparte la caché entre instancias.** Ver abajo; es la limitación grande y es la que hay
  que entender antes de copiar esto.
- **No pinta el richtext**, solo saca su texto. El CMS lo entrega como documento de ProseMirror
  (ADR-107), y recorrer los nodos para decidir cómo se ve cada uno es trabajo de cada web.
- **No tiene rutas.** Una sola página. Un ejemplo con enrutador sería un ejemplo sobre
  enrutadores.
- **No propaga `unocms_preview` al navegar.** Si pulsas un enlace dentro de la vista previa, la
  página siguiente ya no lo es. Está documentado como límite en `DEVELOPER.md`.

## Si la copias

Lo que **sí** merece la pena copiar es `escapar()` y `jsonParaScript()`. El contenido lo escribe
quien edita, así que en una landing normal no es hostil — pero un ejemplo se copia entero, y quien
lo pegue en otra web puede tener otra situación. `jsonParaScript` en particular tapa un agujero
que `JSON.stringify` deja abierto: un valor con un cierre de `script` dentro se sale de la
etiqueta. Está contado en el propio fichero.
