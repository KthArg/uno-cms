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

## Lo que no hace, y no es un descuido

- **No cachea nada.** Una web de verdad cachearía lo publicado y lo revalidaría al publicar. Aquí
  interesa ver el cambio al instante, y una respuesta guardada haría que publicar pareciera no
  hacer nada.
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
