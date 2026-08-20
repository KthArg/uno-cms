# M5 — Landing de ejemplo y vista previa en vivo

Derivado de `SPEC.md` §6 (vista previa en vivo, la que la spec llama "feature central"), §6.3
(contrato con los componentes), §8 (rendimiento de la ruta pública) y §5.1.

Este documento fija el alcance, los contratos y los casos de prueba **antes** de escribir
código. Los tests salen de la tabla de casos, no de la implementación.

---

## 1. Alcance

| Issue | Entrega                                                                      |
| ----- | ---------------------------------------------------------------------------- |
| #137  | Este documento                                                               |
| #112  | `useContent`, `StaticContentProvider` y las secciones de `components/site/`  |
| #113  | `<RichText>` que emite elementos de React (**verifica ADR-107, cierra #19**) |
| #114  | `/preview` con token firmado                                                 |
| #115  | `PreviewFrame` y `PreviewProvider` con `postMessage` acotado                 |
| #116  | E2E de vista previa y de publicación, resolución de **#71** y cierre de M5   |

Orden: **#137 → #112 → #113 → #114 → #115 → #116**. Las secciones van primero porque todo lo
demás las renderiza; `/preview` necesita las secciones montadas para tener algo que enseñar, y
el proveedor reactivo necesita la ruta que lo aloje.

### Por qué este hito es el que justifica el proyecto

Los cuatro hitos anteriores construyeron un CMS que funciona y que, visto desde fuera, se parece
a cualquier otro: se escribe en un panel y el contenido se guarda. Lo que `SPEC.md` §0 pide es
otra cosa —"vista previa en vivo real"— y es este hito el que la entrega o no la entrega.

También es donde se comprueba si la promesa de §6.3 es cierta: **adaptar el CMS a otro proyecto
= escribir `cms.config.ts` + secciones que usen `useContent` + componer `page.tsx`**. Si al
escribir la landing de ejemplo hace falta tocar algo de `cms/`, esa promesa es falsa y hay que
decirlo, no arreglarlo a mano y seguir.

## 2. Fuera de alcance de M5

- **Medir los presupuestos de §8.** Lighthouse CI, LCP y los 60 KB de JavaScript son M6. Aquí se
  respeta la estructura que los hace posibles —server components, sin fetch en cliente— y se
  documenta lo que quede en duda. Medir sin haber terminado la landing sería medir otra cosa.
- **El diseño.** Las secciones son de ejemplo y su aspecto no es un criterio. Lo que se juzga es
  el contrato con `useContent`, no la tipografía.
- **`docs/DEVELOPER.md`**, que §6.3 promete "paso a paso": es M6, cuando el contrato ya no se
  vaya a mover.
- **El resaltado de la sección editada dentro del iframe.** §6.1 menciona "scroll-to-section,
  resalte"; entra el desplazamiento, que es lo que hace falta para no perderse en una landing
  larga. El resalte visual es adorno y no está en ningún criterio de aceptación.
- **Vista previa de móvil y escritorio.** El diagrama de §6.1 dibuja un selector `[Móvil ▾ |
Escritorio]`. No aparece en ningún otro sitio de la spec ni en los criterios de los issues, y
  es una anchura de iframe: post-MVP, con su issue y sin código.

## 3. Contratos

### 3.1 `useContent` y los dos proveedores (§6.3)

El mismo hook, dos fuentes:

| Dónde      | Proveedor               | Qué devuelve                                                   |
| ---------- | ----------------------- | -------------------------------------------------------------- |
| Producción | `StaticContentProvider` | El valor **publicado**, serializado por el servidor. No cambia |
| `/preview` | `PreviewProvider`       | El **borrador**, más los cambios que llegan por `postMessage`  |

Tres decisiones que la spec no fija y hay que fijar:

1. **Sin proveedor, `useContent` lanza.** No devuelve `undefined` ni un objeto vacío: un
   componente que se monta fuera de los dos proveedores es un error de composición, y devolver
   algo plausible lo convertiría en una sección que se pinta vacía sin que nadie sepa por qué.
2. **Con proveedor pero sin esa clave, devuelve el objeto vacío**, no lanza. Es el caso de
   ADR-404: una instalación recién desplegada no tiene contenido, y la landing tiene que
   renderizarse igual. La diferencia con el punto anterior importa —falta el proveedor es un
   fallo del programador; falta el contenido es el estado normal del primer día.
3. **El valor que llega al cliente es el que el servidor ya tenía.** No hay petición desde el
   navegador en producción: §8 dice "el visitante nunca toca la BD en el hot path", y un `fetch`
   en el cliente lo incumpliría igual que una consulta.

### 3.2 `<RichText>` (§6.3, ADR-107)

Recorre el JSON de ProseMirror y **emite elementos de React**. Nunca construye una cadena de
HTML, así que `dangerouslySetInnerHTML` sigue prohibido sin excepciones.

Allowlist de §6.3: `p`, `strong`, `em`, `a[href http/https/mailto]`, `ul`, `ol`, `li`, `h2`–`h4`,
`blockquote`. Lo que no está, se descarta.

**Se filtra otra vez al renderizar aunque ya se filtre al guardar**, y no es duplicar por
duplicar: el saneador de M3 protege lo que entra por las actions, y un documento puede llegar a
la base de datos por otra vía —una restauración, una migración, un `psql`—. El renderizador es
la última línea y es la única que ve el usuario final.

`rel="noopener noreferrer"` en los enlaces externos lo **pone el renderizador**, no el
contenido: M1 decidió no guardar `target`, así que no hay nada en el documento de lo que
heredarlo.

### 3.3 La ruta `/preview` (§6.1 paso 2, §6.2)

- Valida con `verifyToken('preview', …)`. Inválido, caducado o de otro propósito → **404 sin
  detalle**, los tres igual.
- Carga **borradores**, no publicado. Es la razón de existir de la ruta.
- **No escribe nada.** La vista previa no llama a ninguna action ni toca la base de datos para
  guardar.
- `X-Robots-Tag: noindex` —ya lo pone el middleware desde M2— y fuera del sitemap.

**Qué acota el token, que el issue #82 dejó dicho y conviene repetir:** la clave que lleva
dentro limita qué se puede previsualizar. Sin eso, un enlace compartido sería una llave maestra
a todos los borradores del sitio.

### 3.4 El protocolo de `postMessage` (§6.1 pasos 3–5, §6.2)

Del panel al iframe:

```
{ type: 'cms:update', key: string, data: unknown, seq: number }
```

- Se envía con `postMessage(msg, window.location.origin)` — **origen explícito, nunca `*`**.
- Throttle de **150 ms**.
- El receptor **descarta los mensajes cuyo `seq` sea menor o igual al último aplicado**. Sin
  esto, dos mensajes que se cruzan dejan la vista previa enseñando lo que se escribió antes.

Del iframe al panel: `cms:ready` (el iframe ya monta) y `cms:section-visible` (para desplazarse
a la sección que se está editando).

**Las dos comprobaciones del receptor, y por qué son dos:**

1. `event.origin === location.origin` — dice **quién habla**.
2. El payload valida contra el esquema laxo de esa clave — dice **si lo que dice tiene sentido**.

Ninguna sustituye a la otra. El origen no impide que un fallo del propio panel mande basura, y
el esquema no impide que la mande un tercero.

**Un mensaje que no pasa se ignora en silencio.** Sin responder y sin registrar nada visible:
contestar confirmaría que hay alguien escuchando en ese iframe.

### 3.5 Lo que se decide sobre las dos contradicciones abiertas

**#19 — `RichText` no puede sanear en el cliente.** Ya está resuelto por **ADR-107** desde M0:
se emiten elementos de React y no se deriva HTML. Lo que sigue abierto es la **verificación**,
que el propio ADR dejó dicha: "que la salida C se sostenga en la práctica no se sabrá hasta
implementar el renderizador en M5". El issue se cierra con #113 y no antes; si al implementarlo
apareciera un caso que exige `dangerouslySetInnerHTML`, eso sería un ADR nuevo y no una
excepción a la regla de lint.

**#71 — el guard de `/setup` vuelve dinámica la landing.** Se decide en **#116, y no antes**,
porque el propio issue exige medir en vez de suponer y hoy no hay contenido real que medir. Lo
que sí se fija ahora es **cómo se decidirá**: con la landing terminada, se compara el tiempo de
respuesta de la ruta con `force-dynamic` y sin él, y la salida que se adopte va con ADR — incluso
si es dejarlo como está, porque dejar una desviación de §8 sin escribir es lo mismo que no
haberla visto.

## 4. Casos de prueba — la definición de "hecho"

### 4.1 `useContent` y los proveedores (#112)

| ID    | Caso                                                                | Verificación           |
| ----- | ------------------------------------------------------------------- | ---------------------- |
| T-G-1 | Con `StaticContentProvider`, devuelve el valor publicado            | componente             |
| T-G-2 | Sin ningún proveedor, **lanza**                                     | y el mensaje dice cuál |
| T-G-3 | Con proveedor y sin esa clave, devuelve `{}` y la sección no se cae | ADR-404                |
| T-G-4 | Cada sección expone `data-cms-key`                                  | §6.1, lo usa el scroll |
| T-G-5 | La landing renderiza con la base **vacía**, sin contenido publicado | e2e, instalación nueva |
| T-G-6 | La página no hace ninguna petición de datos desde el navegador      | e2e, §8                |

### 4.2 `<RichText>` (#113)

| ID    | Caso                                                                         | Verificación       |
| ----- | ---------------------------------------------------------------------------- | ------------------ |
| T-H-1 | Los nodos y marcas de la allowlist se renderizan                             | componente         |
| T-H-2 | Un nodo fuera de la allowlist se descarta, y el resto del documento se pinta | no se cae todo     |
| T-H-3 | Un `href` con `javascript:` **no** produce un enlace                         | los payloads de M3 |
| T-H-4 | Un enlace externo lleva `rel="noopener noreferrer"`                          | lo pone el render  |
| T-H-5 | Un documento malformado —no es un doc de ProseMirror— no rompe la página     | ADR-404            |
| T-H-6 | En todo el repositorio no hay ni un `dangerouslySetInnerHTML`                | la regla de lint   |

### 4.3 `/preview` (#114)

| ID    | Caso                                                                   | Verificación         |
| ----- | ---------------------------------------------------------------------- | -------------------- |
| T-I-1 | Con token válido, enseña los **borradores**                            | e2e                  |
| T-I-2 | Token inválido, caducado o de otro propósito → **404, los tres igual** | integración          |
| T-I-3 | Sin token → 404                                                        |                      |
| T-I-4 | La ruta no escribe nada en la base de datos                            | afirmado sobre la BD |
| T-I-5 | Lleva `X-Robots-Tag: noindex`                                          | e2e de cabeceras     |

### 4.4 El protocolo (#115)

| ID    | Caso                                                                      | Verificación          |
| ----- | ------------------------------------------------------------------------- | --------------------- |
| T-J-1 | Un `cms:update` válido cambia la sección **sin recargar ni pedir nada**   | e2e                   |
| T-J-2 | Se envía con el origen explícito, nunca `*`                               | inspección del código |
| T-J-3 | Un mensaje de **otro origen** se ignora, y en silencio                    | componente            |
| T-J-4 | Un payload que no valida contra el esquema laxo se ignora                 | componente            |
| T-J-5 | Un `seq` menor o igual al último aplicado se descarta                     | componente            |
| T-J-6 | Con throttle, escribir rápido no manda un mensaje por tecla               | componente            |
| T-J-7 | El iframe manda `cms:ready` y el panel se entera                          | e2e                   |
| T-J-8 | La vista previa **no persiste nada**: el iframe no llama a ninguna action | afirmado sobre la BD  |

### 4.5 Cierre (#116)

| ID    | Caso                                               | Verificación   |
| ----- | -------------------------------------------------- | -------------- |
| T-K-1 | Escribir en el formulario cambia el iframe en vivo | e2e, es la DoD |
| T-K-2 | Publicar y **ver la landing cambiar**              | e2e            |
| T-K-3 | La resolución de #71, medida y con ADR             |                |

**T-K-2 merece una nota**, porque es lo que ADR-405 dejó pendiente: hoy solo está comprobado que
`publish` llama a `revalidateTag` con el tag correcto, **no que la invalidación funcione**. Un
test que espía la llamada pasa igual si el tag no invalida nada. Este es el primer sitio donde
se puede comprobar de verdad, y por eso tiene que afirmar sobre la landing servida, no sobre la
llamada.

---

## 5. Definition of Done de M5

1. La landing de ejemplo renderiza contenido real, con la base vacía y con la base llena.
2. El e2e de vista previa en vivo en verde: escribir cambia el iframe sin recargar.
3. El e2e de publicación en verde: publicar cambia lo que sirve la landing.
4. `<RichText>` implementado y **#19 cerrado**, con ADR-107 verificado en vez de solo escrito.
5. **#71 resuelto con una medida**, no con una intuición, y su ADR.
6. `docs/PROGRESS.md` cierra M5.

---

## 6. Decisiones que exigirán ADR

- **Qué hacer con el guard de `/setup`** (#71). La decisión sale de una medida, pero la medida no
  es la decisión: hay que escribir qué se cede de §7.3 o de §8, porque las dos no caben enteras.
- **Dónde vive `useContent`**. ADR-106 puso `RichText` en `cms/preview/`; el hook tiene el mismo
  problema —lo usan la landing y la vista previa— y conviene que la respuesta sea la misma o que
  se diga por qué no.
- **Si el throttle de 150 ms de §6.1 se mantiene tal cual.** Es un número de la spec y se respeta;
  si al probarlo con contenido real resultara que se nota el retraso al escribir, cambiarlo es
  una desviación y va con ADR en vez de con un número distinto y sin comentario.
